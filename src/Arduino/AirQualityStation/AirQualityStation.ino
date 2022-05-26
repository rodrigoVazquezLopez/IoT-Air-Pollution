#include <UTFT.h>
#include <SFE_BMP180.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <DHT_U.h>
#include <DFRobot_VEML6075.h>
#include <TinyGPS++.h>
#include <RTClib.h>
#include <nRF24L01.h>
#include <printf.h>
#include <RF24.h>
#include <RF24_config.h>.
//#include <HKA5_PMSensor.h>
#include <PMS5003TSSensor.h>
#include <MsgPackMap.h>

// Sensors Pin
#define BATT_PIN A0
#define MQ131_PIN A1
#define MQ9_PIN A2
#define SEN1_PIN A3
#define SEN2_PIN A4
#define SEN3_PIN A5
#define DHT_PIN A6
#define DHTTYPE DHT22
#define VEML6075_ADDR 0x10
// NRF24 Pin
#define CE_PIN 48
#define CSN_PIN 49
#define TAM_PAQ_RF24 28
// TFT Pin
#define RS_PIN 38
#define WR_PIN 39
#define CS_PIN 40
#define RST_PIN 41
#define TOUCH_ORIENTATION  PORTRAIT

enum mainStates
{
    S_IDLE,
    S_LECT,
    S_GPS,
    S_PROM,
    S_GENSTRUCT,
    S_SEND
};

// FSM control variables
enum mainStates edoPresente = S_IDLE, edoSig;

// Transmission variables
byte data[32];
byte direccion[] = "1Node";

// Sensor data variables
float lecturas[10] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
uint16_t CO = 0;
uint16_t O3 = 0;
uint16_t PM2_5 = 0;
uint16_t PM10 = 0;
uint8_t uvindex = 0;
float temp[] = {0, 0};
float humedad = 0;
float presion[] = {0, 0};
float latitud = 0;
float longitud = 0;
float altitud = 2240.0;
uint16_t satelites = 0;
char datetime[] = "2000-00-00T00:00:00Z";

//variables auxiliares
uint8_t idPaq = 0;
uint8_t espera;
uint16_t muestras = 30;//150;
uint16_t lectAct;
double absPres,bmpTemp;
uint8_t cntFeed = 0;

byte msgpackBuffer[250];

//inicializacion de objetos
MsgPackMap parser(msgpackBuffer, 250);
RF24 radio(CE_PIN, CSN_PIN);
TinyGPSPlus gpsAir;
SFE_BMP180 bmpSensor;
//HKA5_PMSensor PMsensor(Serial2);
PMS5003TSSensor PMsensor(Serial2);
DHT_Unified dhtSensor(DHT_PIN, DHTTYPE);
sensors_event_t dhtEvent;
DFRobot_VEML6075_IIC VEML6075(&Wire, VEML6075_ADDR);
RTC_DS1307 rtc;
UTFT myTFT(ITDB28, RS_PIN, WR_PIN, CS_PIN, RST_PIN);

//extern uint8_t SmallFont[];
//extern uint8_t arial_bold[];
extern uint8_t Arial_round_16x24[];
extern uint8_t mykefont2[];

int dispx, dispy, fontSize;

void setup() {
    // put your setup code here, to run once:
    
    Serial.begin(9600);
    Serial1.begin(9600);
    Serial2.begin(9600);
    PMsensor.begin();
    dhtSensor.begin();
    printf_begin(); 
    radio.begin();
    radio.openReadingPipe(1,direccion);
    radio.openWritingPipe(direccion);
    radio.setRetries(15, 15);
    radio.setPALevel(RF24_PA_LOW);
    radio.printDetails();
    myTFT.InitLCD();
    myTFT.clrScr();
    myTFT.setFont(mykefont2);
    dispx=myTFT.getDisplayXSize();
    dispy=myTFT.getDisplayYSize();
    fontSize = myTFT.getFontXsize();
    checkSensors();
    //myTFT.printNumI(readBatteryCharge(), CENTER, 122);
    myTFT.print("WAIT FOR GPS...", CENTER, 180);
    DateTime now = rtc.now();
    Serial.println(now.timestamp());
    smartDelay(30000);
    printBackground();   
}

void loop() {
    switch(edoPresente)
    {
        case S_IDLE:
            radio.powerDown();
            parser.clearData();
            memset(lecturas,0,sizeof(lecturas));
            printValues();
            lectAct = 0;
            edoSig = S_LECT;
            break;
        
        case S_LECT:
            if(lectAct == muestras)
            {
                edoSig = S_GPS;
                Serial.println("Sali de S_LECT");
            }
            else
            {
                printNumSample();
                readSensorsData();          
                lectAct++;
                smartDelay(2000);
                edoSig = S_LECT;              
            }
            break;
        
        case S_GPS:
            readGpsData();
            edoSig = S_PROM;       
            break;
        
        case S_PROM:
            Serial.println("ENTre a Sprom");
            calculateAverageData();
            edoSig = S_GENSTRUCT;
            break;
        
        case S_GENSTRUCT:
            radio.powerUp();
            generateMsgpackData();
            edoSig = S_SEND;
            break;
        
        case S_SEND:
            enviarDatos(parser.getMapSize(), idPaq++);
            edoSig = S_IDLE;
            break;   
        
        default:
            edoSig = S_IDLE;
            break;
    }
    Serial.print("Edo ");
    Serial.print(edoPresente);
    Serial.print(" -> ");
    Serial.println(edoSig);
    edoPresente = edoSig;   
}


void enviarDatos(int tam, uint8_t id)
{
    uint8_t resto = tam%TAM_PAQ_RF24;
    uint8_t totalPackets = (resto == 0) ? tam/TAM_PAQ_RF24 : (tam/TAM_PAQ_RF24)+1;
    uint8_t bytesPerPacket = TAM_PAQ_RF24;
    int posInicial, posFinal;
    for(int i=0;i<totalPackets;i++)
    {
        posInicial = i * TAM_PAQ_RF24;
        posFinal = posInicial + TAM_PAQ_RF24;
        if((i == totalPackets-1) && (resto > 0))
        {
            posFinal = posInicial+resto;
            bytesPerPacket = resto;
        }
        generarPaquete(i, id, totalPackets, bytesPerPacket, posInicial, posFinal);
        myTFT.print("Sending Packet", LEFT, 32);
        myTFT.printNumI(i+1, fontSize*15, 32, 2);
        myTFT.print("/", fontSize*17, 32);
        myTFT.printNumI(totalPackets, fontSize*18, 32, 2);
        if(radio.write(&data,(int)bytesPerPacket+4))
        {
            myTFT.print("Packet received", RIGHT, 32);
        }
        else
        {
            myTFT.print("Packet NOT reeived", RIGHT, 32);
        }
        delay(100);
    }
}

void generarPaquete(uint8_t numPaq, uint8_t id, uint8_t totalPaq, uint8_t numBytes, int inicial, int final)
{
    data[0] = numPaq;
    data[1] = id;
    data[2] = totalPaq;
    data[3] = numBytes;
    int i,j;
    for(i=inicial, j=4;i<final;i++, j++)
    {
        data[j] = msgpackBuffer[i];
    }
}

void checkSensors()
{
    myTFT.setColor(255, 0, 0);
    myTFT.fillRect(0, 0, dispx-1, 13);
    myTFT.setColor(255, 255, 255);
    myTFT.setBackColor(255, 0, 0);
    myTFT.drawLine(0, 14, dispx-1, 14);
    myTFT.print("AIR QUALITY STATION", CENTER, 1);
    myTFT.setBackColor(0, 0, 0);
    myTFT.print("STARTING...", CENTER, 30);
    myTFT.print("IPN-CIDETEC", CENTER, 60);
    myTFT.print("UAM LERMA", CENTER, 72);
    myTFT.print("DEPARTAMENTO DE PROCESOS PRODUCTIVOS", CENTER, 84);
        
    myTFT.print("PMS5003TS", LEFT, 120);
    if(Serial2.available() > 0)
    {
        myTFT.setColor(255, 215, 0);
        myTFT.print("OK", RIGHT, 120);
    }
    else
    {
        myTFT.setColor(255, 0, 0);
        myTFT.print("BAD", RIGHT, 120);
    }
    myTFT.setColor(255, 255, 255);
    
    myTFT.print("BMP180", LEFT, 132);
    if(bmpSensor.begin())
    {
        myTFT.setColor(255, 215, 0);
        myTFT.print("OK", RIGHT, 132);
    }
    else
    {
        myTFT.setColor(255, 0, 0);
        myTFT.print("BAD", RIGHT, 132);
    }
    myTFT.setColor(255, 255, 255);
    
    myTFT.print("VEML6075", LEFT, 144);    
    if(VEML6075.begin())
    {
        myTFT.setColor(255, 215, 0);
        myTFT.print("OK", RIGHT, 144);
    }
    else
    {
        myTFT.setColor(255, 0, 0);
        myTFT.print("BAD", RIGHT, 144);
    }
    myTFT.setColor(255, 255, 255);

    myTFT.print("RTC", LEFT, 156);    
    if(rtc.begin())
    {
        myTFT.setColor(255, 215, 0);
        myTFT.print("OK", RIGHT, 156);
    }
    else
    {
        myTFT.setColor(255, 0, 0);
        myTFT.print("BAD", RIGHT, 156);
    }
    myTFT.setColor(255, 255, 255);
}

void printBackground()
{
    myTFT.clrScr();
    myTFT.fillScr(0, 0, 255);
    myTFT.setColor(255, 0, 0);
    myTFT.fillRect(0, 0, dispx-1, 13);
    myTFT.setColor(255, 255, 255);
    myTFT.setBackColor(255, 0, 0);
    myTFT.drawLine(0, 14, dispx-1, 14);
    myTFT.print("AIR QUALITY STATION", CENTER, 1);
    myTFT.setBackColor(0, 0, 0);
    myTFT.print("Sampling...", LEFT, 20);

    myTFT.print("Dir: 0x65646F6E31", RIGHT, 20);

    myTFT.setColor(0, 0, 0);
    myTFT.fillRect(5, 65, dispx-5, 173);
    myTFT.setColor(255, 255, 255);
    myTFT.drawRect(5, 65, dispx-5, 173);
    
    myTFT.print("O3:", 10, 70);
    myTFT.print("CO:", 10, 82);
    myTFT.print("PM2.5:", 10, 94);
    myTFT.print("PM10:", 10, 106);
    myTFT.print("UVIndex:", 10, 118);

    myTFT.print("Temp:", 10, 130);
    myTFT.print("Hum:", 10, 142);
    myTFT.print("Press:", 10, 156);

    myTFT.print("Lat:", 200, 70);
    myTFT.print("Lng:", 200, 82);
    myTFT.print("Alt:", 200, 94);
    myTFT.print("Sat:", 200, 106);
}

void printValues()
{
    //myTFT.printNumI(readBatteryCharge(), RIGHT, 15);
    
    myTFT.printNumI(O3, (fontSize*4)+10, 70, 3);
    myTFT.print("ppm", (fontSize*8)+10, 70);
    myTFT.printNumI(CO, (fontSize*4)+10, 82, 3);
    myTFT.print("ppm", (fontSize*8)+10, 82);
    myTFT.printNumI(PM2_5, (fontSize*7)+10, 94, 3);
    myTFT.print("ug/m3", (fontSize*11)+10, 94);
    myTFT.printNumI(PM10, (fontSize*6)+10, 106, 3);
    myTFT.print("ug/m3", (fontSize*10)+10, 106);
    myTFT.printNumI(uvindex, (fontSize*9)+10, 118, 2);

    myTFT.printNumF(temp[0], 2, (fontSize*6)+10, 130);
    myTFT.print(",", (fontSize*11)+10, 130);
    myTFT.printNumF(temp[1], 2, (fontSize*13)+10, 130);
    myTFT.printNumF(humedad, 2, (fontSize*5)+10, 142);
    myTFT.print("%", (fontSize*10)+10, 142);
    myTFT.printNumF(presion[1], 3, (fontSize*7)+10, 156);
    myTFT.print("hPa", (fontSize*14)+10, 156);
       
    myTFT.printNumF(latitud, 4, (fontSize*5)+200, 70);
    myTFT.printNumF(longitud, 4, (fontSize*5)+200, 82);
    myTFT.printNumF(altitud, 2, (fontSize*5)+200, 94);
    myTFT.printNumI(satelites, (fontSize*5)+200, 106);

    DateTime now = rtc.now();
    myTFT.printNumI(now.day(), 84, 220, 2, '0');
    myTFT.print("/", 84+(fontSize*2), 220);
    myTFT.printNumI(now.month(), 84+(fontSize*3), 220, 2, '0');
    myTFT.print("/", 84+(fontSize*5), 220);
    myTFT.printNumI(now.year(), 84+(fontSize*6), 220);
    
    myTFT.printNumI(now.hour(), 84+(fontSize*11), 220, 2, '0');
    myTFT.print(":", 84+(fontSize*13), 220);
    myTFT.printNumI(now.minute(), 84+(fontSize*14), 220, 2, '0');
    myTFT.print(":", 84+(fontSize*16), 220);
    myTFT.printNumI(now.second(), 84+(fontSize*17), 220, 2, '0');
  
}

void printNumSample()
{ 
    myTFT.printNumI(lectAct+1, fontSize*12, 20, 3);
    myTFT.print("/", fontSize*15, 20);
    myTFT.printNumI(muestras, fontSize*17, 20);

    DateTime now = rtc.now();
    myTFT.printNumI(now.day(), 84, 220, 2, '0');
    myTFT.print("/", 84+(fontSize*2), 220);
    myTFT.printNumI(now.month(), 84+(fontSize*3), 220, 2, '0');
    myTFT.print("/", 84+(fontSize*5), 220);
    myTFT.printNumI(now.year(), 84+(fontSize*6), 220);
    
    myTFT.printNumI(now.hour(), 84+(fontSize*11), 220, 2, '0');
    myTFT.print(":", 84+(fontSize*13), 220);
    myTFT.printNumI(now.minute(), 84+(fontSize*14), 220, 2, '0');
    myTFT.print(":", 84+(fontSize*16), 220);
    myTFT.printNumI(now.second(), 84+(fontSize*17), 220, 2, '0');
}

// OK functions
void readSensorsData()
{
    //lectura CO y O3
    lecturas[0] += analogRead(MQ9_PIN);
    lecturas[1] += analogRead(MQ131_PIN);
    
    //lectura PM
    PMsensor.readData();
    lecturas[2] += PMsensor.getConcentrationPM2_5();
    lecturas[3] += PMsensor.getConcentrationPM10_0();
    
    //lectura UV
    float Uva = VEML6075.getUva();
    float Uvb = VEML6075.getUvb();
    lecturas[4] += VEML6075.getUvi(Uva, Uvb);
    
    //lectura DHT22
    dhtSensor.temperature().getEvent(&dhtEvent);
    lecturas[5] += dhtEvent.temperature;
    dhtSensor.humidity().getEvent(&dhtEvent);
    lecturas[7] += dhtEvent.relative_humidity;
    
    //lectura BMP180
    espera = bmpSensor.startTemperature();
    delay(espera);
    bmpSensor.getTemperature(bmpTemp);
    lecturas[6] += bmpTemp;
    espera = bmpSensor.startPressure(3);
    delay(espera);
    bmpSensor.getPressure(absPres,bmpTemp);
    lecturas[8] += absPres;
    lecturas[9] += bmpSensor.sealevel(absPres,altitud);
}

static void smartDelay(unsigned long ms)
{
  unsigned long start = millis();
  do 
  {
    while (Serial1.available())
      gpsAir.encode(Serial1.read());
  } while (millis() - start < ms);
}


void readGpsData()
{
    
    if(gpsAir.location.isValid() && gpsAir.altitude.isValid())
    {
        latitud = gpsAir.location.lat();
        longitud = gpsAir.location.lng();
        altitud = gpsAir.altitude.meters();
        if(altitud == 0)
            altitud = 2240.0;
    }
    if(gpsAir.date.isValid() && gpsAir.time.isValid())
    {
        sprintf(datetime, "%02d-%02d-%02dT%02d:%02d:%02dZ", gpsAir.date.year(), gpsAir.date.month(), gpsAir.date.day(), gpsAir.time.hour(), gpsAir.time.minute(), gpsAir.time.second());
    }
    //satelites = gpsAir.satellites.value();
}

void calculateAverageData()
{
    CO = lecturas[0]/muestras;
    O3 = lecturas[1]/muestras;
    PM2_5 = lecturas[2]/muestras;
    PM10 = lecturas[3]/muestras;
    uvindex = lecturas[4]/muestras;
    temp[0] = lecturas[5]/muestras;
    temp[1] = lecturas[6]/muestras;
    humedad = lecturas[7]/muestras;
    presion[0] = lecturas[8]/muestras;
    presion[1] = lecturas[9]/muestras;
}

void generateMsgpackData()
{
    parser.beginMap();
    parser.beginSubMap("device");
    parser.addString("id", "AIRQ");
    parser.addString("type", "1");
    parser.endSubMap();
    parser.beginSubMap("pollutant");
    parser.addInteger("CO", CO);
    parser.addInteger("O3", O3);
    parser.addInteger("PM25", PM2_5);
    parser.addInteger("PM10", PM10);
    parser.addInteger("UVindex", uvindex);
    parser.endSubMap();
    parser.beginSubMap("weather");
    parser.addFloatArray("temperature", temp, 2);
    parser.addFloat("humidity", humedad);
    parser.addFloatArray("pressure", presion, 2);
    parser.endSubMap();
    parser.beginSubMap("gps");
    parser.addFloat("lat", latitud);
    parser.addFloat("lon", longitud);
    parser.addFloat("alt", altitud);
    parser.endSubMap();
    parser.addString("datetime", datetime);
}

// Menu functions

int readBatteryCharge()
{
    int percentage;
    int val = analogRead(BATT_PIN);
    float volt = (val*5.0/1024.0)*2;
    Serial.println(volt);
    percentage = map(volt,5.7,8.2,0,100); 
    Serial.println(percentage);

    return percentage;
}
