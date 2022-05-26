const msgpack = require("msgpack-lite");
const nrf24 = require("nrf24");
const ThingSpeakClient = require('thingspeakclient');
const MongoClient = require('mongodb').MongoClient;

var rf24 = new nrf24.nRF24(22, 0);
rf24.begin(print_debug=true);
rf24.config({
	PALevel: nrf24.RF24_PA_LOW,
	DataRate: nrf24.RF24_1MBPS,
	Irq: 27,
}, print_details=true);

var client = new ThingSpeakClient();
var tsChannel = 1745957;
client.attachChannel(tsChannel, { writeKey:'7CA43YA53WORU6WE', readKey:'PKWHFVAUC7I8A69X'});
var dbUrl = "mongodb://localhost:27017/";

var airDirection = "0x65646f4e31";
var waterDirection = "0x65646f4e32";
var noiseDirection = "0x65646f4e33";

var airPipe = rf24.addReadPipe(airDirection, true);
var waterPipe = rf24.addReadPipe(waterDirection, true);
var noisePipe = rf24.addReadPipe(noiseDirection, true);

var bufferPipe1 = Buffer.alloc(32);
var bufferPipe2 = Buffer.alloc(32);
var bufferPipe3 = Buffer.alloc(32);

var msgAir = Buffer.alloc(256);
var msgWater = Buffer.alloc(256);
var msgNoise = Buffer.alloc(256);

var noise;
var waterQuality;
var airQuality;
  
rf24.read( function (data,items) {
	for(var i=0;i<items;i++) {
		if(data[i].pipe == airPipe) {
			// data[i].data will contain a buffer with the data
			bufferPipe1 = data[i].data;
			//console.log(data[i].data);
			console.log('Air Quality package %d/%d from %s',bufferPipe1[0] + 1, bufferPipe1[2], airDirection);
			//construirPaqueteAir(bufferPipe1);
			if (reconstruirMensaje(bufferPipe1, msgAir)) {
				airQuality = msgpack.decode(msgAir);
				console.log(airQuality);
				sendToThingSpeak(airQuality, tsChannel);
				writeToDB(airQuality, "airQuality")
			}
		} else if (data[i].pipe == waterPipe) {
			// rcv from 0xABCD11FF56
			bufferPipe2 = data[i].data
			console.log('Water Quality package %d/%d from %s',bufferPipe2[0] + 1, bufferPipe2[2], waterDirection);
			if (reconstruirMensaje(bufferPipe2, msgWater)) {
				waterQuality = msgpack.decode(msgWater);
				console.log(waterQuality);
				sendToThingSpeak(waterQuality, tsChannel);
				writeToDB(waterQuality, "waterQuality");
			}
		} else {
			bufferPipe3 = data[i].data;
			console.log('Noise Package %d/%d from %s',bufferPipe3[0] + 1, bufferPipe3[2], noiseDirection);
			if (reconstruirMensaje(bufferPipe3, msgNoise)) {
				noise = msgpack.decode(msgNoise);
				console.log(noise);
				sendToThingSpeak(noise, tsChannel);
				writeToDB(noise, "noise");
			}
		}
	}}, function(stop,by_user,err_count) {
		console.log("Error");
	});


function reconstruirMensaje (package, msgBuffer) {
	var numPaq = package[0];
	var id = package[1]
	var numTotalPaq = package[2];
	var numBytes = package[3];
	
	package.copy(msgBuffer, numPaq*28, 4, numBytes+4);
	if(numPaq == numTotalPaq-1) {		
		return true;
	}
	return false;
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
		sendToThingSpeak(airQuality, 1745957)
		writeToDB(airQuality);
	}
}

function sendToThingSpeak (data, channel) {
	tsData = {
		field1: data.pollutant.CO,
		field2: data.pollutant.O3,
		field3: data.pollutant.PM25,
		field4: data.pollutant.PM10,
		field5: data.pollutant.UVindex,
		field6: data.weather.temperature[0],
		field7: data.weather.humidity,
		field8: data.weather.pressure[1],
		latitude: data.gps.lat,
		longitude: data.gps.lon,
		elevation: data.gps.alt,
	};
	//console.log(tsData);
	client.updateChannel(channel, tsData, function(err, resp) {
		if (!err && resp > 0) {
			console.log('update successfully. Entry number was: ' + resp);
		}
	});
}

function writeToDB (data, collection) {
	if (data.datetime.lastIndexOf("2000") != -1) {
		var now = new Date();
		data._id = now.toISOString();
	} else {
		data._id = data.datetime;
	}
	delete data.datetime;
	MongoClient.connect(dbUrl, function(err, db) {
		if (err) throw err;
		var dbo = db.db("pollution");
		dbo.collection(collection).insertOne(data, function(err, res) {
			if (err) throw err;
			console.log("1 document inserted on %s in DB", collection);
			db.close();
		});
	});
}





