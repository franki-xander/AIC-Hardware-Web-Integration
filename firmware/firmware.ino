#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ==========================================================================
// 1. HARDWARE & NETWORK CONFIGURATIONS
// ==========================================================================
#define DHTPIN 4          
#define DHTTYPE DHT22     

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const String GOOGLE_SCRIPT_ID = "YOUR_GOOGLE_SCRIPT_ID_HERE"; 
const String SENSOR_ID = "esp32_office_1"; 

// ==========================================================================
// 2. SAFE MULTI-THREADING AND STATE VARIABLES
// ==========================================================================
DHT dht(DHTPIN, DHTTYPE);

// RULE 1: Global Mutex Handle to guarantee single-thread access to the Wi-Fi radio
SemaphoreHandle_t networkStackMutex;

// Marked volatile because it's shared and updated dynamically between loop cycles
volatile unsigned long currentDelayMinutes = 5; 

// Forward declaration of our defensive functions
void telemetryTask(void * pvParameters);
void verifyNetworkIntegrity();

void setup() {
  Serial.begin(115200);
  dht.begin();
  
  // RULE 1: Initialize the Mutual Exclusion semaphore lock
  networkStackMutex = xSemaphoreCreateMutex();
  
  Serial.print("Initializing core Wi-Fi handshake...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  // RULE 1: Pin our telemetry workflow to Core 1 as a dedicated FreeRTOS task.
  // We allocate 8192 bytes of stack space to comfortably process heavy SSL encryption and JSON parsing.
  xTaskCreatePinnedToCore(
    telemetryTask,      // Task function
    "TelemetryTask",    // Textual name for debugging
    8192,               // Stack size in words
    NULL,               // Task input parameter
    1,                  // Priority (1 = standard background task)
    NULL,               // Task handle tracker
    1                   // Explicitly execute on Core 1 (keeps Core 0 free for system Wi-Fi handling)
  );
  
  Serial.println("\nSetup initialization complete. Defensive thread spawned.");
}

void loop() {
  // Keep the main loop entirely unblocked and empty. 
  // All operational logic runs deterministically inside its own designated thread task.
  vTaskDelay(pdMS_TO_TICKS(1000));
}

// ==========================================================================
// 3. THE ISOLATED TELEMETRY WORKER THREAD
// ==========================================================================
void telemetryTask(void * pvParameters) {
  for(;;) {
    
    // RULE 4: Evaluate and repair the physical network link before processing data
    verifyNetworkIntegrity();

    if (WiFi.status() == WL_CONNECTED) {
      
      // RULE 1: Acquire the network lock token. If another thread is broadcasting, wait indefinitely.
      if (xSemaphoreTake(networkStackMutex, portMAX_DELAY) == pdTRUE) {
        
        // RULE 3: Enforce strict variable scoping. Wrapping our transactional variables 
        // in an explicit nested block forces the compiler to completely demolish all 
        // JSON document objects, buffers, and string allocations from memory the moment the block closes.
        {
          float h = dht.readHumidity();
          float t = dht.readTemperature();

          if (!isnan(h) && !isnan(t)) {
            Serial.printf("Telemetry Sampling -> Temp: %.2f°C | Humid: %.2f%%\n", t, h);
            
            WiFiClientSecure *client = new WiFiClientSecure;
            if (client) {
              client->setInsecure(); // Bypasses explicit root certificate tracking to eliminate bricking risks
              
              HTTPClient http;
              String url = "https://script.google.com/macros/s/" + GOOGLE_SCRIPT_ID + "/exec";
              
              http.begin(*client, url);
              http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS); // Follow Google's 302 redirect smoothly
              
              // RULE 2: Hard 5-second boundary. Stops the chip from hanging forever if a packet drops mid-stream.
              http.setTimeout(5000); 
              
              // Serialize outgoing payload metrics
              StaticJsonDocument<200> doc;
              doc["sensor_id"] = SENSOR_ID;
              doc["temperature"] = t;
              doc["humidity"] = h;
              
              String requestBody;
              serializeJson(doc, requestBody);
              
              Serial.println("Posting telemetry payload into network pipeline...");
              int httpResponseCode = http.POST(requestBody);
              
              if (httpResponseCode > 0) {
                String responseBody = http.getString();
                Serial.println("Transmission Confirmed.");
                
                // Parse control parameters returned from the cloud core database
                StaticJsonDocument<200> responseDoc;
                DeserializationError error = deserializeJson(responseDoc, responseBody);
                if (!error && responseDoc.containsKey("command_interval")) {
                  currentDelayMinutes = responseDoc["command_interval"].as<unsigned long>();
                  Serial.printf("Dynamic loop sync: Device set to sleep for %lu minutes.\n", currentDelayMinutes);
                }
              } else {
                Serial.printf("Network Error encountered during POST operation: %s\n", http.errorToString(httpResponseCode).c_str());
              }
              
              // RULE 3: Absolute Resource Demolition. Explicitly purge the sockets and reclaim raw heap space.
              http.end();
              delete client;
            }
          } else {
            Serial.println("Hardware Warning: Sensor data lines returned NaN. Sampling skipped.");
          }
        } // ◄ RULE 3: Out of scope! All temporary floats, strings, and JSON documents are structurally deleted here.
        
        // RULE 1: Relinquish the mutex token immediately so the radio stack can be claimed by other system routines.
        xSemaphoreGive(networkStackMutex);
      }
    }
    
    // Execute dynamic, non-blocking FreeRTOS delays based on backend settings
    Serial.printf("Entering thread sleep cycle. Next poll in %lu minutes.\n", currentDelayMinutes);
    vTaskDelay(pdMS_TO_TICKS(currentDelayMinutes * 60 * 1000));
  }
}

// ==========================================================================
// 4. RULE 4: DECOUPLED NON-BLOCKING NETWORK GATEKEEPER
// ==========================================================================
void verifyNetworkIntegrity() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Network connectivity dropped! Initializing clean reconnection routine...");
    
    // Clear out active corrupted states completely before requesting a fresh lease
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    int connectionAttempts = 0;
    // Attempt link recovery silently up to 10 times (5 total seconds) without pinning the CPU infinitely
    while (WiFi.status() != WL_CONNECTED && connectionAttempts < 10) {
      vTaskDelay(pdMS_TO_TICKS(500));
      connectionAttempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("Network layer successfully restored.");
    } else {
      Serial.println("Network recovery window expired. post-phoned until next transaction sweep.");
    }
  }
}