const msgpack = require("msgpack-lite");
const nrf24 = require("nrf24");

var rf24 = new nrf24.nRF24(22, 0);
rf24.begin();
rf24.config({
	PALevel: nrf24.RF24_PA_LOW,
	DataRate: nrf24.RF24_1MBPS,
	Irq: 27,
});

var airPipe = rf24.addReadPipe("0x65646f4e33");
var waterPipe = rf24.addReadPipe("0x65646f4e34");
var noisePipe = rf24.addReadPipe("0x65646f4e35");
  
rf24.read( function (data,items) {
	for(var i=0;i<items;i++) {
		if(data[i].pipe == airPipe) {
			// data[i].data will contain a buffer with the data
			bufferPipe1 = data[i].data
			console.log('Paquete %d de %d Air',bufferPipe2[0],bufferPipe2[2]);
			construirPaqueteAir(bufferPipe2);
		} else if (data[i].pipe == waterPipe) {
			// rcv from 0xABCD11FF56
		} else {

		}
	}
  },
  function(stop,by_user,err_count) {

  });


var bufferPipe1 = Buffer.alloc(32);
var bufferPipe2 = Buffer.alloc(32);
var msgNoise = Buffer.alloc(256);
var msgAir = Buffer.alloc(256);
var noise;
var airQuality;

nrfInterrupt.watch(function(err,value) {
	if(err) {
		console.log(err);
	} else {
		var check = radio.availableFull();
		if(check.channel == 1) {
			bufferPipe1 = radio.read(32);
			console.log('Paquete %d de %d Noise',bufferPipe1[0],bufferPipe1[2]);
			construirPaqueteNoise(bufferPipe1);
		}
		if(check.channel == 2) {
			bufferPipe2 = radio.read(32);
			console.log('Paquete %d de %d Air',bufferPipe2[0],bufferPipe2[2]);
			construirPaqueteAir(bufferPipe2);
		}
		
	}
});

process.on('SIGINT', () => {
	nrfInterrupt.unexport();
});

function construirPaqueteNoise (bufNoise) {
	var numPaq = bufNoise[0];
	var id = bufNoise[1]
	var numPaqNoise = bufNoise[2];
	var cantBytes = bufNoise[3];
	
	bufNoise.copy(msgNoise,numPaq*28,4,cantBytes+4);
	if(numPaq == numPaqNoise-1) {		
		noise = msgpack.decode(msgNoise);
		console.log(noise);
		if(client.connected) {
			client.publish(TOPIC, JSON.stringify(noise));
			console.log('publicado');
		}
		
	}
}

function construirPaqueteAir (bufAir) {
	var numPaq = bufAir[0];
	var id = bufAir[1]
	var numPaqAir = bufAir[2];
	var cantBytes = bufAir[3];
	
	bufAir.copy(msgAir,numPaq*28,4,cantBytes+4);
	if(numPaq == numPaqAir-1) {		
		airQuality = msgpack.decode(msgAir);
		console.log(airQuality);
		if(client.connected) {
			client.publish(TOPIC, JSON.stringify(airQuality));
			console.log('publicado');
		}
	}
}

var ORG = 'quickstart';
var TYPE = 'gateway';
var ID = 'gateway984fee057265';
var AUTHTOKEN = 'dsiclerma';

var mqtt = require('mqtt');

var PROTOCOL = 'mqtt';
var BROKER = ORG + '.messaging.internetofthings.ibmcloud.com';
var PORT = 1883;

var URL = PROTOCOL + '://' + BROKER;
URL += ':' + PORT; 

var CLIENTID= 'd:' + ORG;
CLIENTID += ':' + TYPE;
CLIENTID += ':' + ID;
var AUTHMETHOD = 'use-token-auth';

var client  = mqtt.connect(URL, { clientId: CLIENTID, username: AUTHMETHOD, password: AUTHTOKEN });
var TOPIC = 'iot-2/evt/status/fmt/json';
console.log(TOPIC);



client.on('connect', function () {
 //setInterval(function(){client.publish(TOPIC, JSON.stringify(noise));//Payload is JSON
 //}, 10000);//Keeps publishing every 2000 milliseconds.
});

