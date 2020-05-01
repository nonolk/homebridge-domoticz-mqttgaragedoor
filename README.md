# homebridge-mqttgaragedoor
An homebridge plugin that create an HomeKit Garage Door Opener accessory mapped on Domoticz MQTT topics

# Installation
Follow the instruction in [homebridge](https://www.npmjs.com/package/homebridge) for the homebridge server installation.
The plugin must be cloned locally (git clone https://github.com/nonolk/homebridge-domoticz-mqttgaragedoor.git ) and should be installed "globally" by typing:

    npm install -g ./homebridge-domoticz-mqttgaragedoor
   
# Release notes
Version 0.0.1

# Configuration
Remember to configure the plugin in config.json in your home directory inside the .homebridge directory. Configuration parameters:
```javascript
{
  "accessory": "domoticsmqttgaragedoor",
  "name": "NAME OF THE GARAGE DOOR OPENER",
  "url": "URL OF THE BROKER",
  "username": "USERNAME OF THE BROKER",
  "password": "PASSWORD OF THE BROKER"
  "topics": {
                "statusSet":    "MQTT TOPIC TO SET THE DOOR OPENER"
                "openGet":      "OPTIONAL: MQTT TOPIC TO GET THE DOOR OPEN STATUS",
                "openValue":    "OPTIONAL VALUE THAT MEANS OPEN (DEFAULT true)"
                "closedGet":    "OPTIONAL: MQTT TOPIC TO GET THE DOOR CLOSED STATUS",
                "closedValue":  "OPTIONAL VALUE THAT MEANS CLOSED (DEFAULT true)"
                "openStatusCmd": "OPTIONAL: THE OPEN STATUS COMMAND ( DEFAULT "")",
                "closeStatusCmd": "OPTIONAL THE CLOSED STATUS COMMAND (DEFAULT "")",
            },
  "doorRunInSeconds": "OPEN/CLOSE RUN TIME IN SECONDS (DEFAULT 20"),
  "pauseInSeconds" : "IF DEFINED : AUTO CLOSE AFTER [Seconds]"
}
```

# Credit

The original homebridge MQTT plugins work was done by [ilcato](https://github.com/ilcato) in his [homebridge-mqttswitch](https://github.com/ilcato/homebridge-mqttswitch) project.

The original homebridge GarageDoor mqqt plugin work was done by moppy4483 https://moppi4483/homebridge-mqttgaragedoor.


