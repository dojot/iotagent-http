"use strict";

// Libraries
const IotAgent = require("@dojot/iotagent-nodejs");
const express = require("express");
const https = require("https");
const http = require("http");
const fs = require("fs");
const tls = require("tls");

const {
  SERVER_PORT_HTTPS,
  SERVER_PORT_HTTP,
  HTTP_TLS_SECURE_ENABLED,
  HTTP_TLS_SECURE_CERT,
  HTTP_TLS_SECURE_KEY,
  HTTP_TLS_CA_CERT,
  HTTP_TLS_CRL_CERT,
} = process.env;

global.dojotDevicesInfo = {};

const NO_DATA = "NO DATA";
const INVALID = "INVALID";
var attempts = 0;

// Initialize the IoT Agent.
let iotAgent = new IotAgent.IoTAgent();
iotAgent
  .init()
  .then(() => {
    console.log("Succeeded to start the HTTP IoT Agent ");

    // Handle device.create event
    iotAgent.messenger.on(
      "iotagent.device",
      "device.create",
      (tenant, event) => {
        console.log(
          `Received device.create event ${event.data.label} for tenant ${tenant}.`
        );

        let deviceId = event.data.id;
        let deviceName = event.data.label;

        dojotDevicesInfo[deviceId] = {
          tenant,
          deviceId,
        };
      }
    );

    // Handle device.update event
    iotAgent.messenger.on(
      "iotagent.device",
      "device.update",
      (tenant, event) => {
        console.log(
          `Received device.update event ${event} for tenant ${tenant}.`
        );
        // TODO handle this event
      }
    );

    // Handle device.remove event
    iotAgent.messenger.on(
      "iotagent.device",
      "device.remove",
      (tenant, event) => {
        console.log(
          `Received device.update event ${event} for tenant ${tenant}.`
        );
        // TODO handle this event
      }
    );

    // force device.create events for devices created before starting the iotagent
    iotAgent.messenger.generateDeviceCreateEventForActiveDevices();

    // HTTP app
    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // handle HTTP post
    app.post("/readings", (req, res) => {
      console.log(`Received HTTP message: ${JSON.stringify(req.body)}`);

      const body = req.body;
      let tenant;
      let deviceId;
      let readings;

      if (req.socket instanceof tls.TLSSocket) {
        // retrieve certificates from the request ( in der format )
        const clientCert = req.socket.getPeerCertificate();
        if (
          !clientCert.hasOwnProperty("subject") ||
          !Object.hasOwnProperty.bind(clientCert.subject)("CN")
        ) {
          res.status(400).send({ message: "Client certificate is invalid." });
          return;
        }
        if (body.hasOwnProperty("deviceId")) {
          deviceId = body.deviceId;
          // validate if the message belongs to some device
          if (!dojotDevicesInfo.hasOwnProperty(deviceId)) {
            res.status(400).send({
              message: "Not found the device associated with this message",
            });
            return;
          }
          const dojotDeviceInfo = dojotDevicesInfo[deviceId];
          tenant = dojotDeviceInfo.tenant;
          readings = body.readings;
          // validate if the message belongs to some device
          if (clientCert.subject.CN !== `${tenant}:${deviceId}`) {
            res.status(400).send({
              message: `Connection rejected for ${deviceId} due to invalid client certificate.`,
            });
            return;
          }
        } else {
          const cn = clientCert.subject.CN;
          const cnArray = cn.split(":");
          tenant = cnArray[0];
          deviceId = cnArray[1];
          readings = body.readings;
        }
      } else {
        if (
          !body.hasOwnProperty("readings") ||
          !body.hasOwnProperty("deviceId")
        ) {
          res.status(400).send({ message: "Missing attribute" });
          return;
        }

        deviceId = body.deviceId;
        readings = body.readings;

        // validate if the message belongs to some device
        if (!dojotDevicesInfo.hasOwnProperty(deviceId)) {
          res.status(400).send({
            message: "Not found the device associated with this message",
          });
          return;
        }

        const dojotDeviceInfo = dojotDevicesInfo[deviceId];
        tenant = dojotDeviceInfo.tenant;
      }

      readings.forEach(function (reading) {
        const metadata = {};
        metadata.timestamp = Date.parse(reading.timestamp);
        delete reading.timestamp;
        const msg = { ...reading };

        console.log(msg);

        msg["device"] = deviceId;

        console.log(deviceId, tenant, msg, { ...metadata });

        // send data to dojot internal services
        iotAgent.updateAttrs(deviceId, tenant, msg, { ...metadata });
      });

      res.status(200).send({ message: "OK" });
    });

    const reloadCertificates = (interval) => {
      try {
        httpsServer.setSecureContext({
          cert: fs.readFileSync(`${HTTP_TLS_SECURE_CERT}`),
          key: fs.readFileSync(`${HTTP_TLS_SECURE_KEY}`),
          ca: fs.readFileSync(`${HTTP_TLS_CA_CERT}`),
          crl: fs.readFileSync(`${HTTP_TLS_CRL_CERT}`),
        });
        console.log("Seted new secure context");
        clearInterval(interval);
      } catch (err) {
        attempts++;
        if (attempts > 10) clearInterval(interval);
      }
    };

    fs.watch("/certs", (eventType, filename) => {
      console.log(`${eventType}: The ${filename} was modified!`);
      let interval = setInterval(() => {
        reloadCertificates(interval);
      }, 1000);
    });

    const httpsServer = https.createServer(
      {
        cert: fs.readFileSync(`${HTTP_TLS_SECURE_CERT}`),
        key: fs.readFileSync(`${HTTP_TLS_SECURE_KEY}`),
        ca: fs.readFileSync(`${HTTP_TLS_CA_CERT}`),
        rejectUnauthorized: true,
        requestCert: true,
      },
      app
    );

    // start HTTPS app
    httpsServer.listen(SERVER_PORT_HTTPS || 3124, () => {
      console.log(
        `IotAgent HTTPS listening on port ${SERVER_PORT_HTTPS || 3124}!`
      );
    });

    if (HTTP_TLS_SECURE_ENABLED === "true") {
      const httpServer = http.createServer(app);

      // start HTTP app
      httpServer.listen(SERVER_PORT_HTTP || 3123, () => {
        console.log(
          `IotAgent HTTP listening on port ${SERVER_PORT_HTTP || 3123}!`
        );
      });
    }
  })
  .catch((error) => {
    console.error(`Failed to initialize the HTTP IoT Agent (${error})`);
    process.exit(1);
  });

function addParsedDataIntoMessage(msg, key, value) {
  // console.log(`${key}: ${value}`);
  if (value != NO_DATA && value != INVALID) {
    msg[key] = value;
  }
}

function getSecondaryBreakPedalState(data) {
  try {
    if (data.length >= 13) {
      // Now, to parse break pedal value, we need to read the fifth byte string
      let hexaStringOfSecondaryPedalBreak = data.substring(11, 13);

      // Now we need the equivalent integer of the string above
      let secondaryBreakPedalInteger = Number(
        "0x" + hexaStringOfSecondaryPedalBreak
      );

      // The break pedal is the 7th bit of the above byte, so it is
      // necessary to shift right the bits so that bit become the
      // last one
      secondaryBreakPedalInteger = secondaryBreakPedalInteger >> 1;

      // Now, to discover if the break pedal is pressed (1) or released (0),
      // we perform a bit wise operation
      let secondaryPedalBreakIsPressed =
        (secondaryBreakPedalInteger & 0x01) == 0x01;

      return secondaryPedalBreakIsPressed;
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getActualTorque(data) {
  try {
    if (data.length >= 9) {
      let hexaStringOfActualTorque = data.substring(7, 9);

      if (hexaStringOfActualTorque == "FF") {
        return INVALID;
      }
      let actualTorqueInteger = Number("0x" + hexaStringOfActualTorque);
      let actualTorque = actualTorqueInteger * 2 - 100;

      return actualTorque;
    } else {
      return NO_DATA;
    }
  } catch (error) {
    return INVALID;
  }
}

function getAcceleratorPedal(data) {
  try {
    if (data.length >= 11) {
      let hexaStringOfAcceleratorPedal = data.substring(9, 11);

      if (hexaStringOfAcceleratorPedal == "FF") {
        return INVALID;
      }

      let acceleratorPedalInteger = Number("0x" + hexaStringOfAcceleratorPedal);
      let acceleratorPedal = acceleratorPedalInteger * 0.5;

      return acceleratorPedal;
    } else {
      return NO_DATA;
    }
  } catch (error) {
    return INVALID;
  }
}

function getAutomaticPilot(data) {
  try {
    if (data.length >= 13) {
      let hexaStringOfAutomaticPilot = data.substring(11, 13);

      let automaticPilotInteger = Number("0x" + hexaStringOfAutomaticPilot);
      automaticPilotInteger = automaticPilotInteger >> 2;

      let automaticPilot = automaticPilotInteger & 0x03;

      if (automaticPilot == 0) {
        return "WAITING";
      } else if (automaticPilot == 1) {
        return "SUSPENDED";
      } else if (automaticPilot == 2) {
        return "ACTIVE";
      } else if (automaticPilot == 3) {
        return "COMMAND_FAULTY";
      }
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getRpm(data) {
  try {
    if (data.length >= 7) {
      let hexaStringOfRpm = data.substring(3, 7);

      if (hexaStringOfRpm == "FFFF") {
        return "INVALID";
      }

      let rpmInteger = Number("0x" + hexaStringOfRpm);

      let rpm = rpmInteger * 0.125;

      return rpm;
    } else {
      return "NO DATA";
    }
  } catch (error) {
    return "INVALID";
  }
}

function getFuelLevel(data) {
  try {
    if (data.length >= 11) {
      let hexaStringOfFuelLevel = data.substring(9, 11);

      if (hexaStringOfFuelLevel == "FF") {
        return INVALID;
      }

      let fuelLevelInteger = Number("0x" + hexaStringOfFuelLevel);

      let fuelLevel = fuelLevelInteger * 0.5;

      return fuelLevel;
    } else {
      return NO_DATA;
    }
  } catch (error) {
    return INVALID;
  }
}

function getBatteryCharge(data) {
  try {
    if (data.length >= 5) {
      let hexaStringOfBatteryLevel = data.substring(3, 5);

      if (hexaStringOfBatteryLevel == "FF") {
        return INVALID;
      }

      if (hexaStringOfBatteryLevel == "FE") {
        return NO_DATA;
      }

      let batteryLevel = Number("0x" + hexaStringOfBatteryLevel);

      return batteryLevel;
    } else {
      return NO_DATA;
    }
  } catch (error) {
    return INVALID;
  }
}

function getVelocity(data) {
  try {
    if (data.length >= 7) {
      let hexaStringOfVelocity = data.substring(3, 7);

      if (hexaStringOfVelocity == "FFFF") {
        return INVALID;
      }

      let velocityInteger = Number("0x" + hexaStringOfVelocity);

      let velocity = velocityInteger * 0.01;

      return velocity;
    } else {
      return NO_DATA;
    }
  } catch (error) {
    return INVALID;
  }
}

function getEngineOilTemperature(data) {
  try {
    if (data.length >= 15) {
      let hexaStringOfEngineOilTemp = data.substring(13, 15);

      if (hexaStringOfEngineOilTemp == "FF") {
        return INVALID;
      }

      let engineOilTempInteger = Number("0x" + hexaStringOfEngineOilTemp);

      let engineOilTemperature = engineOilTempInteger - 40;

      return engineOilTemperature;
    } else {
      return NO_DATA;
    }
  } catch (error) {
    return INVALID;
  }
}

function getClutchState(data) {
  try {
    if (data.length >= 9) {
      let hexaStringOfClutchState = data.substring(7, 9);

      let clutchStateInteger = Number("0x" + hexaStringOfClutchState);
      clutchStateInteger = clutchStateInteger >> 6;

      let clutchState = clutchStateInteger & 0x03;

      return getClutchStateLabel(clutchState);
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getClutchStateLabel(clutchState) {
  switch (clutchState) {
    case 0:
      return "DECLUTCHED";
    case 1:
      return "SLIDING";
    case 2:
      return "CLUTCHED";
    case 3:
    default:
      return INVALID;
  }
}

function getEngagedGear(data) {
  try {
    if (data.length >= 5) {
      let hexaStringOfEngagedGear = data.substring(3, 5);

      let engagedGearInteger = Number("0x" + hexaStringOfEngagedGear);

      engagedGearInteger = engagedGearInteger >> 4;

      let engagedGear = engagedGearInteger & 0x0f;

      return getEngagedGearLabel(engagedGear);
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getEngagedGearLabel(engagedGear) {
  switch (engagedGear) {
    case 0:
      return "DISENGAGED";
    case 1:
      return "1";
    case 2:
      return "2";
    case 3:
      return "3";
    case 4:
      return "4";
    case 5:
      return "5";
    case 6:
      return "6";
    case 7:
      return "7";
    case 8:
      return "8";
    case 9:
      return "REVERSE_GEAR";
    case 10:
      return "NEUTRAL";
    default:
      return INVALID;
  }
}

function getLeverPosition(data) {
  try {
    if (data.length >= 5) {
      let hexaStringOfLeverPosition = data.substring(3, 5);

      let leverPositionInteger = Number("0x" + hexaStringOfLeverPosition);

      let leverPosition = leverPositionInteger & 0x0f;

      if (leverPosition == 0) {
        return "P";
      } else if (leverPosition == 1) {
        return "R";
      } else if (leverPosition == 2) {
        return "N";
      } else if (leverPosition == 3) {
        return "D";
      } else if (leverPosition == 4) {
        return "4";
      } else if (leverPosition == 5) {
        return "3";
      } else if (leverPosition == 6) {
        return "2";
      } else if (leverPosition == 7) {
        return "1";
      } else if (leverPosition == 8) {
        return "P/R INTERMEDIATE";
      } else if (leverPosition == 9) {
        return "N/D INTERMEDIATE (BVA)";
      } else if (leverPosition == 10) {
        return "INTERMEDIATE BVA";
      }
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getClutchPedalContact(data) {
  try {
    if (data.length >= 9) {
      let hexaStringOfClutchPedalContact = data.substring(11, 13);

      let clutchPedalContactInteger = Number(
        "0x" + hexaStringOfClutchPedalContact
      );

      clutchPedalContactInteger = clutchPedalContactInteger >> 3;
      let clutchPedalContact = clutchPedalContactInteger & 0x03;

      if (clutchPedalContact == 0) {
        return "RELEASED";
      } else if (clutchPedalContact == 1) {
        return "PRESSED";
      } else if (clutchPedalContact == 2) {
        return "INITIAL_VALUE";
      } else if (clutchPedalContact == 3) {
        return "OUT_OF_USE";
      } else {
        return INVALID;
      }
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getAirConditioningPressure(data) {
  try {
    if (data.length >= 9) {
      let hexaStringOfAirConditioningPressure = data.substring(7, 9);

      if (hexaStringOfAirConditioningPressure == "FF") {
        return INVALID;
      }

      let airConditioningPressureInteger = Number(
        "0x" + hexaStringOfAirConditioningPressure
      );

      let airConditioningPressure = airConditioningPressureInteger * 11 + 110;

      return airConditioningPressure;
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getGmvState(data) {
  try {
    if (data.length >= 19) {
      let hexaStringOfGmvState = data.substring(17, 19);

      let gmvStateInteger = Number("0x" + hexaStringOfGmvState);

      let gmvState = gmvStateInteger & 0x3f;

      if (gmvState == 0x3f) {
        return INVALID;
      }

      gmvState = gmvState * 2;
      return gmvState;
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getExternalAirTemperature(data) {
  try {
    if (data.length >= 9) {
      let hexaStringOfExternalAirTemperature = data.substring(7, 9);

      if (
        hexaStringOfExternalAirTemperature == "FB" ||
        hexaStringOfExternalAirTemperature == "FC" ||
        hexaStringOfExternalAirTemperature == "FD" ||
        hexaStringOfExternalAirTemperature == "FE" ||
        hexaStringOfExternalAirTemperature == "FF"
      ) {
        return INVALID;
      }

      let externalAirTemperatureInteger = Number(
        "0x" + hexaStringOfExternalAirTemperature
      );

      let externalAirTemperature = externalAirTemperatureInteger * 0.5 - 40;

      return externalAirTemperature;
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getOdometer(data) {
  try {
    if (data.length >= 17) {
      let hexaStringOfOdometer = data.substring(11, 17);

      if (hexaStringOfOdometer == "FFFFFF") {
        return INVALID;
      }

      let odometer = Number("0x" + hexaStringOfOdometer);

      return odometer;
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getAtmPressure(data) {
  try {
    if (data.length >= 15) {
      let hexaStringOfAtmPressure = data.substring(13, 15);
      let atmPressureInteger = Number("0x" + hexaStringOfAtmPressure);

      atmPressureInteger = atmPressureInteger >> 2;

      atmPressureInteger = atmPressureInteger & 0x1f;
      if (atmPressureInteger == 0x1f) {
        return INVALID;
      }

      let atmPressure = atmPressureInteger * 15 + 685;

      return atmPressure;
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getBatteryVoltage(data) {
  try {
    if (data.length >= 15) {
      let hexaStringOfBatteryVoltage = data.substring(13, 15);

      if (hexaStringOfBatteryVoltage == "FF") {
        return INVALID;
      }

      let batteryVoltageInteger = Number("0x" + hexaStringOfBatteryVoltage);

      let batteryVoltage = batteryVoltageInteger * 0.05 + 7;

      return batteryVoltage;
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getConsumption(data) {
  try {
    if (data.length >= 7) {
      let hexaStringOfConsumption = data.substring(5, 7);
      let consumptionInteger = Number("0x" + hexaStringOfConsumption);

      let consumption = consumptionInteger * 80;

      return consumption;
    } else {
      return NO_DATA;
    }
  } catch (error) {}
  return INVALID;
}

function getEngineWaterTemperature(data) {
  try {
    if (data.length >= 5) {
      let hexaStringOfEngineWaterTemperature = data.substring(3, 5);

      if (hexaStringOfEngineWaterTemperature == "FF") {
        return INVALID;
      }

      let engineWaterTemperatureInteger = Number(
        "0x" + hexaStringOfEngineWaterTemperature
      );

      let engineWaterTemperature = engineWaterTemperatureInteger - 40;

      return engineWaterTemperature;
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getInletAirTemperature(data) {
  try {
    if (data.length >= 19) {
      let hexaStringOfInletAirTemperature = data.substring(17, 19);

      if (hexaStringOfInletAirTemperature == "FF") {
        return INVALID;
      }
      let inletAirTemperatureInteger = Number(
        "0x" + hexaStringOfInletAirTemperature
      );

      let inletAirTemperature = inletAirTemperatureInteger - 40;
      return inletAirTemperature;
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getCompressorClutchState(data) {
  try {
    if (data.length >= 5) {
      let hexaStringOfCompressorClutch = data.substring(3, 5);
      let compressorClutchInteger = Number("0x" + hexaStringOfCompressorClutch);

      let compressorClutchState = (compressorClutchInteger >> 1) & 0x01;

      return compressorClutchState == 1;
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}

function getAirConditioningPower(data) {
  try {
    if (data.length >= 13) {
      let hexaStringOfAirConditioningPower = data.substring(11, 13);

      if (hexaStringOfAirConditioningPower == "FF") {
        return INVALID;
      }

      let airConditioningPowerInteger = Number(
        "0x" + hexaStringOfAirConditioningPower
      );
      let airConditioningPower = airConditioningPowerInteger * 25;

      return airConditioningPower;
    } else {
      return NO_DATA;
    }
  } catch (error) {}

  return INVALID;
}
