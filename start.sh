#!/bin/bash

echo "Lanzando servicio de mongodb...."
sudo systemctl status mongod

echo "Ejecutando servidor..."
cd ~/IoT-Air-Pollution/src/Node/
node app.js