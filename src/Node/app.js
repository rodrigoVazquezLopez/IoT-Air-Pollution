const msgpack = require("msgpack-lite");
const nrf24 = require("nrf24");
const ThingSpeakClient = require('thingspeakclient');

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
			bufferPipe2 = data[i].data;
			console.log('Paquete %d de %d Noise',bufferPipe1[0],bufferPipe1[2]);
			construirPaqueteNoise(bufferPipe1);
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

var client = new ThingSpeakClient();
client.attachChannel(1745957, { writeKey:'7CA43YA53WORU6WE', readKey:'PKWHFVAUC7I8A69X'});

process.on('SIGINT', () => {
	//nrfInterrupt.unexport();
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
		client.updateChannel(1745957, {field1: 7, field2: 6}, function(err, resp) {
			if (!err && resp > 0) {
				console.log('update successfully. Entry number was: ' + resp);
			}
		});
	}
}





