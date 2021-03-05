// Domoticz MQTT GarageDoor Accessory plugin for HomeBridge
//
// Remember to add accessory to config.json. Example:
// "accessories": [
//     {
//            	"accessory": "domoticzmqttgaragedoor",
//            	"name": "NAME OF THE GARAGE DOOR OPENER",
//            	"url": "URL OF THE BROKER",
//  	      	"username": "USERNAME OF THE BROKER",
//		"password": "PASSWORD OF THE BROKER"
//		"switchid" : "Domoticz idx of the open/close switch"
//		"statusid" : "Domoticz idx of the open/close sensor"
// 		"topics": {
// 				"openValue": 	"Value of domoticz sensor for open (default "1")",
// 				"closedValue": 	"Value of domoticz sensor for closed (default "0")",
//				"openStatusCmd": "Domoticz switch command to open",
//				"closeStatusCmd": "Domoticz switch command to close",
//				"showlog": "Optional: activate verbose mode (default "")"
// 			},
//     "doorRunInSeconds": "OPEN/CLOSE RUN TIME IN SECONDS (DEFAULT 20")
//     }
// ],
//

'use strict';

var Service, Characteristic, DoorState, PlatformAccessory;
var mqtt = require('mqtt');

/**
 * A simple clone function that also allows you to pass an "extend" object whose properties will be
 * added to the cloned copy of the original object passed.
 */
function clone(object, extend) {

  var cloned = {};

  for (var key in object) {
    cloned[key] = object[key];
  }

  for (var key in extend) {
    cloned[key] = extend[key];
  }

  return cloned;
};

function DomoticzMqttGarageDoorAccessory(log, config) {
  	this.log          	= log;
  	this.name 		= config["name"];
  	this.url 		= config["url"];
	this.client_Id 		= 'mqttjs_' + Math.random().toString(16).substr(2, 8);
	this.options = {
	    	keepalive: 10,
    		clientId: this.client_Id,
	    	protocolId: 'MQTT',
    		protocolVersion: 4,
    		clean: true,
    		reconnectPeriod: 2000,
    		connectTimeout: 30 * 1000,
		will: {
			topic: '/lwt',
			payload: this.name + ' Connection Closed abnormally..!',
			qos: 0,
			retain: false
		},
	    	username: config["username"],
		password: config["password"],
    		rejectUnauthorized: false
	};
	this.domoswitch = config["switchid"];
  	this.domostatus = config["statusid"];
	this.domocmdtopic	= "domoticz/in";
  	this.domostatustopic 	= "domoticz/out";
  	this.OpenValue		= ( config["topics"].openValue !== undefined ) ? config["topics"].openValue : "1";
	this.ClosedValue	= ( config["topics"].closedValue !== undefined ) ? config["topics"].closedValue : "0";
	this.openStatusCmd	= '{"command": "switchlight", "idx": '+this.domoswitch+', "switchcmd": "'+config["topics"].openStatusCmd+'" }';
	this.closeStatusCmd	= '{"command": "switchlight", "idx": '+this.domoswitch+', "switchcmd": "'+config["topics"].closeStatusCmd+'" }';;
	this.doorRunInSeconds 	= (config["doorRunInSeconds"] !== undefined ? config["doorRunInSeconds"] : 20 );
	this.topicverbose	= config["topics"].showlog;

	this.Running = false;
	this.Closed = true;
	this.Open = !this.Closed;
	this.Startup = true;
	this.Obstructed = false;

	var that = this;

	this.garageDoorOpener = new Service.GarageDoorOpener(this.name);

	this.currentDoorState = this.garageDoorOpener.getCharacteristic(Characteristic.CurrentDoorState);
    	this.currentDoorState
		.on('get', this.getState.bind(this));

	this.targetDoorState = this.garageDoorOpener.getCharacteristic(Characteristic.TargetDoorState);
    	this.targetDoorState
		.on('set', this.setTargetState.bind(this))
    		.onGet(this.handleTargetDoorStateGet.bind(this));

	this.ObstructionDetected = this.garageDoorOpener.getCharacteristic(Characteristic.ObstructionDetected);
	this.ObstructionDetected
		.onGet(this.handleObstructionDetectedGet.bind(this));

	if (this.lwt !== undefined ) this.reachable = false
	else this.reachable = true;

    	this.infoService = new Service.AccessoryInformation();
    	this.infoService
      	   .setCharacteristic(Characteristic.Manufacturer, "Opensource Community and Nonolk")
           .setCharacteristic(Characteristic.Model, "Homebridge Domoticz MQTT GarageDoor")
	   .setCharacteristic(Characteristic.FirmwareRevision,"1.0.2")
           .setCharacteristic(Characteristic.SerialNumber, "20200501");


	// connect to MQTT broker
	this.client = mqtt.connect(this.url, this.options);
	this.client.on('error', function () {
		that.log('Error event on MQTT');
	});


	// Fixed issue where after disconnections topics would no resubscripted
	// based on idea by [MrBalonio] (https://github.com/mrbalonio)
	this.client.on('connect', function () {
		that.log('Subscribing to topics');
 		that.client.subscribe(that.domostatustopic);
	});

	this.client.on('message', function (topic, message) {
                var status;
		if (message.length != 0) {
                var msg = JSON.parse(message);
		if (msg.idx == that.domostatus)
		{
		 if (msg.nvalue == 0)
		 {
		  status = "Off";
		 }
		 else if (msg.nvalue == 1)
		 {
		  status = "On";
		 };
                };
		}
		if( topic == that.lwt ) {
			if ( message == that.lwt_payload ) {
				that.log("Gone Offline");
				that.reachable = false;
			// Trick to force "Not Responding" state
				that.garageDoorOpener.removeCharacteristic(that.StatusFault);
			} else {
 				if(!that.reachable) {
                                	that.reachable = true;
                        // Trick to force the clear of the "Not Responding" state
                                that.garageDoorOpener.addOptionalCharacteristic(Characteristic.StatusFault);
                                that.StatusFault = that.garageDoorOpener.getCharacteristic(Characteristic.StatusFault);
                        	};
			}
		} else if (status){
			if(!that.reachable) {
				that.reachable = true;
			// Trick to force the clear of the "Not Responding" state
				that.garageDoorOpener.addOptionalCharacteristic(Characteristic.StatusFault);
				that.StatusFault = that.garageDoorOpener.getCharacteristic(Characteristic.StatusFault);
			};
			if (status == that.ClosedValue){
       				that.log("Received CLOSED message");
				var topicGotStatus = (status == that.ClosedValue);
				that.isClosed( topicGotStatus);
				if( topicGotStatus ) var NewDoorState = DoorState.CLOSED
                        	else var NewTarget = DoorState.OPEN;
			} else if (status == that.OpenValue){
				that.log("Received OPEN message");
				var topicGotStatus = (status == that.OpenValue);
				that.isOpen( topicGotStatus);
				if(topicGotStatus) var NewDoorState = DoorState.OPEN
				else var NewTarget = DoorState.CLOSED;
			};

	        	that.showLog("Getting state " +that.doorStateReadable(NewDoorState) + " its was " + that.doorStateReadable(that.currentDoorState.value) + " [TOPIC : " + topic + " ]");
			if ( topicGotStatus ) {
			  that.log("Heartbeat");
				if (that.doorStateReadable(NewDoorState) !== that.doorStateReadable(that.currentDoorState.value)) {
					that.log("Heartbeat differents");
					if ((that.doorStateReadable(that.currentDoorState.value) == "OPENING") && (that.doorStateReadable(NewDoorState) == "CLOSED")) {
					 that.setObstructionState( true );
					}
					else if  ((that.doorStateReadable(that.currentDoorState.value) == "CLOSING") && (that.doorStateReadable(NewDoorState) == "OPEN")) {
					 that.setObstructionState( true );
					}
					else if  (that.doorStateReadable(that.currentDoorState.value) == "STOPPED") {
					 that.setObstructionState( true );
					}
					else that.setObstructionState( false );
        				that.currentDoorState.setValue(NewDoorState);
	               			that.targetDoorState.updateValue(NewDoorState);
					that.Running = false;
					clearTimeout( that.TimeOut );
				};
			} else if (!that.Running && that.DoorStateChanged ) {
                       		that.targetDoorState.setValue( NewTarget, undefined, "fromGetValue");
			};
			that.showLog("Final Getting State is " + that.doorStateReadable(that.currentDoorState.value) );
		}
	});

    	this.currentDoorState.updateValue( DoorState.CLOSED );
   	this.targetDoorState.updateValue( DoorState.CLOSED );
        this.currentDoorState.getValue();
}

module.exports = function(homebridge) {
  	Service = homebridge.hap.Service;
  	Characteristic = homebridge.hap.Characteristic;
	DoorState = homebridge.hap.Characteristic.CurrentDoorState;

  	homebridge.registerAccessory("homebridge-domoticz-mqttgaragedoor", "domoticzmqttgaragedoor", DomoticzMqttGarageDoorAccessory);
}

DomoticzMqttGarageDoorAccessory.prototype = {

	doorStateReadable : function( doorState ) {
		switch (doorState) {
		case DoorState.OPEN:
			return "OPEN";
		case DoorState.OPENING:
			return "OPENING";
		case DoorState.CLOSING:
			return "CLOSING";
		case DoorState.CLOSED:
			return "CLOSED";
		case DoorState.STOPPED:
			return "STOPPED";
		}
	},

	showLog: function( msg, status ) {
	     if( this.topicverbose !== undefined ) {
                if ( msg !== undefined)  this.log( msg );
                if( status !== undefined) this.log("Status : " + this.doorStateReadable(status));
		this.log(" isClosed : " + this.isClosed() + " / " + this.Closed );
		this.log(" isOpen : " + this.isOpen() + " / " + this.Open );
		this.log(" currentState (HK) : " + this.doorStateReadable(this.currentDoorState.value) );
	 	this.log(" targetState (HK) : " + this.doorStateReadable(this.targetDoorState.value) );
		this.log(" Running : " + this.Running );
		this.log("----"  );
            }
	},

	checkReachable: function( callback ) {
		this.showLog('Triggered Check reachable');
		if( this.reachable ) callback()
		else callback(1);
	},


	setTargetState: function(status, callback, context) {
	 	this.showLog("Setting Target :", status);
		if( this.reachable) {
			if( status != this.currentDoorState.value ) {
				this.showLog('Set target');
				this.showLog(this.currentDoorState.value);
				this.setObstructionState( false);
				clearTimeout( this.TimeOut );
        			this.Running = true;
				this.showLog("Before wait timeout");
				this.TimeOut = setTimeout(this.setFinalDoorState.bind(this), this.doorRunInSeconds * 1000);
				if ( context !== 'fromGetValue'){
					if (status == 0)
					{
		        			this.log("Triggering GarageDoor Command: Open");
						this.client.publish(this.domocmdtopic, this.openStatusCmd);
					}
					else if (status == 1)
					{
						this.log("Triggering GarageDoor Command: Closed");
                                                this.client.publish(this.domocmdtopic, this.closeStatusCmd);
					};
				}
            			this.currentDoorState.setValue( (status == DoorState.OPEN ?  DoorState.OPENING : DoorState.CLOSING ) );
			};
			callback();
		} else callback(1);
	},

	isClosed: function(status) {
		this.showLog("Isclosed");
		this.showLog(status);
		if( status !== undefined ) {
			if( this.Closed !== status  ) {
				this.DoorStateChanged = true;
				this.Closed = status;
        if( this.domostatustopic == undefined ) this.Open = ! this.Closed;
			} else this.DoorStateChanged = false;
		};
		return(this.Closed);
 	},

	isOpen: function(status) {
		this.showLog("Isopen");
                this.showLog(status);
		if( status !== undefined ) {
			if( this.Open !== status ) {
				this.DoorStateChanged = true;
				this.Open = status;
				if( this.domostatustopic == undefined ) this.Closed = ! this.Open;
			} else this.DoorStateChanged = false;
		};
		return(this.Open);
 	},

	setFinalDoorState: function() {
		this.showLog("After wait timeout");
	 	this.showLog("Setting Final", this.targetDoorState.value);
		this.Running = false;
		delete this.TimeOut;

		switch(this.targetDoorState.value) {
			case DoorState.OPEN:
				if(this.domostatustopic == undefined) this.isOpen(true);
				break;
			case DoorState.CLOSED:
				if(this.domostatustopic == undefined) this.isClosed(true);
				break;
		};
		if( ! this.getObstructionState() ){
			if (((this.targetDoorState.value == DoorState.OPEN) && this.isOpen()) !== ((this.targetDoorState.value == DoorState.CLOSED) && this.isClosed()) ) {
				this.currentDoorState.setValue( ( this.isClosed() ? DoorState.CLOSED : DoorState.OPEN) );
			} else {
				this.setObstructionState( true );
			};
		};
	 	this.showLog("Setting Final END" );
  	},

	getState: function( callback ) {
				if( this.reachable) {
			this.client.publish(this.domocmdtopic, '{"command": "getdeviceinfo", "idx": '+this.domostatus+' }');
    			this.log("Garage Door is " + this.doorStateReadable(this.currentDoorState.value) );
                	callback(null, this.currentDoorState.value);
		} else {
			this.showLog("Offline");
			callback(1);
		}
	},

        getObstructionState: function() {
		var isC = this.isClosed();
	        var isO = this.isOpen();
		var obs =  ( ( ( !this.Running ) && (isO == isC ) ) || ( isC && isO ) ) ;
		this.showLog("Get Obstruction " + obs );
		this.setObstructionState( obs );
		return(obs);
	},

	setObstructionState: function( state ) {
		if ( state )  {
                   this.currentDoorState.setValue( DoorState.STOPPED );
		   this.Obstructed = true;
                   if( !this.isClosed() ) this.targetDoorState.updateValue( DoorState.OPEN)
		   else this.targetDoorState.updateValue( 1 - this.targetDoorState.value);
		}
		else this.Obstructed = false;
                this.ObstructionDetected.setValue( state );
		this.showLog("Set Obstruction " + state );
	},
   
        handleObstructionDetectedGet() {
	    	this.showLog('Triggered GET ObstructionDetected');

		this.showLog("Handle Obstruction " + this.Obstructed );

	    	return this.Obstructed;
  	},

	handleTargetDoorStateGet() {
		this.showLog('Triggered GET TargetDoorState');
		
		if(this.Startup) {
		 this.log('Statup assuming closed');
    		 var currentValue = DoorState.CLOSED;
		 this.Startup = false;
		}
		else {
		var currentValue = this.targetDoorState.value;
		}
    		return currentValue;
 	 },


	getServices:  function() {
		return [this.infoService, this.garageDoorOpener];
	},
};
