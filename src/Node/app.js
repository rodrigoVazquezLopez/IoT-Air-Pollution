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

var airPipe = rf24.addReadPipe("0x65646f4e31", true);
var waterPipe = rf24.addReadPipe("0x65646f4e32", true);
var noisePipe = rf24.addReadPipe("0x65646f4e33", true);
  
rf24.read( function (data,items) {
	for(var i=0;i<items;i++) {
		if(data[i].pipe == airPipe) {
			// data[i].data will contain a buffer with the data
			bufferPipe1 = data[i].data;
			//console.log(data[i].data);
			console.log('Paquete %d de %d Air',bufferPipe1[0],bufferPipe1[2]);
			construirPaqueteAir(bufferPipe1);
		} else if (data[i].pipe == waterPipe) {
			// rcv from 0xABCD11FF56
		} else {
			bufferPipe2 = data[i].data;
			console.log('Paquete %d de %d Noise',bufferPipe2[0],bufferPipe2[2]);
			construirPaqueteNoise(bufferPipe2);
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
var dbUrl = "mongodb://localhost:27017/";


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
		tsData = {
			field1: airQuality.pollutant.CO,
			field2: airQuality.pollutant.O3,
			field3: airQuality.pollutant.PM25,
			field4: airQuality.pollutant.PM10,
			field5: airQuality.pollutant.UVindex,
			field6: airQuality.weather.temperature[0],
			field7: airQuality.weather.humidity,
			field8: airQuality.weather.pressure[1],
			latitude: airQuality.gps.lat,
			longitude: airQuality.gps.lon,
			elevation: airQuality.gps.alt,
		};
		console.log(tsData);
		client.updateChannel(1745957, tsData, function(err, resp) {
			if (!err && resp > 0) {
				console.log('update successfully. Entry number was: ' + resp);
			}
		});
		writeToDB(airQuality);
	}
}

function writeToDB (data) {
	if (data.datetime.lastIndexOf("2000") != -1) {
		var now = new Date();
		data._id = now.toISOString();
	} else {
		data._id = data.datetime
	}
	delete data.datetime;
	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbo = db.db("pollution");
		dbo.collection("airQuality").insertOne(data, function(err, res) {
			if (err) throw err;
			console.log("1 document inserted");
			db.close();
		});
	});
}





