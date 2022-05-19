const Gpio = require('onoff').Gpio;
const nrfInterrupt = new Gpio(27, 'in', 'falling');

//curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -

var rf24js = require('rf24js');
var radio = rf24js.radio;
var PALevel = rf24js.PALevel;
var CRCLength = rf24js.CRCLength;
var Datarate = rf24js.Datarate;

/*
var msgpack = require('msgpack5')() // namespace our extensions
  , encode  = msgpack.encode
  , decode  = msgpack.decode*/
  
var msgpack = require("msgpack-lite");

radio.create(22, 0); // RaspberryPi 1/2/3 
radio.begin();
radio.setPALevel(0);
radio.printDetails();

var pipe1 = new Buffer("1Node\0");
var pipe2 = new Buffer("2Node\0");
var pipe3 = new Buffer("3Node\0");

radio.openWritingPipe(pipe1);
radio.openReadingPipe(1, pipe2)
radio.openReadingPipe(2, pipe3)
radio.enableInterrupts(false,false,true);
radio.startListening();

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


/*while(1)
{
	if (radio.available())
	{
		buffer = radio.read(32);
		console.log(buffer)
		console.log('dato %d',cnt++);
	}
}*/
/*
async function loop() {
		while (radio.available())
		{
			buffer = radio.read(32);
			console.log(buffer)
			console.log('dato %d',cnt++);
		}
	setTimeout(loop,100); 
}

loop();*/
