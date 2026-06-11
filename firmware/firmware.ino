#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ==========================================================================
// 1. HARDWARE & NETWORK CONFIGURATIONS (NEVER POST WIFI PASSWORD PUBLICLY)
// ==========================================================================
#define DHTPIN 4          // Digital pin connected to the DHT22 data line
#define DHTTYPE DHT22     // Explicitly identifying the sensor module type

const char* WIFI_SSID = "WIFI NAME SSID";  // Wifi Name
const char* WIFI_PASSWORD = "WIFI PASSWORD";      // Wifi Password

// Paste your exact Google Web App Deployment ID (the long string between /s/ and /exec)
const String GOOGLE_SCRIPT_ID = "YOUR_GOOGLE_SCRIPT_ID_HERE"; 

// Hardware configuration tracker matching your js/app.js profile
const String SENSOR_ID = "esp32_office_1"; 

// Global state controller
DHT dht(DHTPIN, DHTTYPE);
unsigned long currentDelayMinutes = 5; // System default fallback interval

void setup() {
  Serial.begin(115200);
  dht.begin();
  
  // Initialize Wi-Fi connection layer
  Serial.print("Connecting to Wi-Fi Network...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi connection successfully established!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    
    // 1. Gather Physical Environmental Data
    float h = dht.readHumidity();
    float t = dht.readTemperature();

    // Guard checking for hardware line errors or disconnected sensor pins
    if (isnan(h) || isnan(t)) {
      Serial.println("CRITICAL: Failed to read from the physical DHT22 sensor element.");
      delay(10000); // Wait 10 seconds before trying again
      return;
    }

    Serial.printf("Telemetry Sampling -> Temp: %.2f°C | Humid: %.2f%%\n", t, h);

    // 2. Instantiate Secure Wi-Fi Network Clients
    WiFiClientSecure *client = new WiFiClientSecure;
    if(client) {
      // Bypasses root certificate anchor validation chains to eliminate maintenance overhead
      client->setInsecure(); 
      
      HTTPClient http;
      String url = "https://script.google.com/macros/s/" + GOOGLE_SCRIPT_ID + "/exec";
      
      Serial.println("Opening API endpoint link layer...");
      http.begin(*client, url);
      
      // PRO-TIP: Google Apps Script forces a 302 redirect to a temporary cloud storage bucket.
      // This line forces the ESP32 to follow the redirect natively instead of dropping the connection.
      http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
      
      // 3. Serialize Data Metrics into standard minified JSON payloads
      StaticJsonDocument<200> doc;
      doc["sensor_id"] = SENSOR_ID;
      doc["temperature"] = t;
      doc["humidity"] = h;
      
      String requestBody;
      serializeJson(doc, requestBody);
      
      // 4. Fire the Encrypted Outbound Data Stream
      http.addHeader("Content-Type", "application/json");
      int httpResponseCode = http.POST(requestBody);
      
      if (httpResponseCode > 0) {
        String responseBody = http.getString();
        Serial.println("Transmission Confirmed. Server Response:");
        Serial.println(responseBody);
        
        // 5. Parse the Response Payload to Sync Runtime Control Intervals
        StaticJsonDocument<200> responseDoc;
        DeserializationError error = deserializeJson(responseDoc, responseBody);
        
        if (!error && responseDoc.containsKey("command_interval")) {
          currentDelayMinutes = responseDoc["command_interval"].as<unsigned long>();
          Serial.printf("Node Synced. System runtime cycle interval adjusted to: %lu minutes.\n", currentDelayMinutes);
        }
      } else {
        Serial.printf("Error executing secure API post transmission: %s\n", http.errorToString(httpResponseCode).c_str());
      }
      
      // Clean up stack execution memory allocations
      http.end();
      delete client;
    }
  } else {
    Serial.println("Wi-Fi connection lost. Attempting reconnection protocol...");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }

  // Execute standard dynamic non-blocking deep delays or loop execution pauses
  Serial.printf("Entering sleep cycle. Next transmission in %lu minutes.\n", currentDelayMinutes);
  delay(currentDelayMinutes * 60 * 1000);
}