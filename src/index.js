"use strict";

// Libraries
const IotAgent = require("@dojot/iotagent-nodejs");
const express = require("express");
const https = require("https");
const http = require("http");
const fs = require("fs");
const tls = require("tls");
const config = require("./config");

let attempts = 0;

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

      if (!body.hasOwnProperty("readings")) {
        res.status(400).send({ message: "Missing attribute readings" });
        return;
      }

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
        if (body.hasOwnProperty("deviceId") && body.hasOwnProperty("tenant")) {
          deviceId = body.deviceId;
          tenant = body.tenant;
          readings = body.readings;
          // validate if the message belongs to same device than certificate
          if (clientCert.subject.CN !== `${tenant}:${deviceId}`) {
            res.status(400).send({
              message: `Connection rejected for ${deviceId} due to invalid client certificate. The tenant and deviceid sent in the body are not the same as the certificate.`,
            });
            return;
          }
        } else {
          readings = body.readings;
          const cn = clientCert.subject.CN;
          try {
            const cnArray = cn.split(":");
            tenant = cnArray[0];
            deviceId = cnArray[1];
          } catch (e) {
            res.status(400).send({
              message: `Error trying to get tenant and deviceId in CN of certificate.`,
            });
          }
        }
      } else {
        if (
          !body.hasOwnProperty("deviceId") ||
          !body.hasOwnProperty("tenant")
        ) {
          res
            .status(400)
            .send({ message: "Missing attribute tenant or deviceId" });
          return;
        }

        deviceId = body.deviceId;
        tenant = body.tenant;
        readings = body.readings;
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
          cert: fs.readFileSync(`${config.http_tls.cert}`),
          key: fs.readFileSync(`${config.http_tls.key}`),
          ca: fs.readFileSync(`${config.http_tls.ca}`),
          crl: fs.readFileSync(`${config.http_tls.crl}`),
        });
        console.log("Seted new secure context");
        clearInterval(interval);
      } catch (err) {
        attempts++;
        if (attempts > config.reload_certificates_attempts)
          clearInterval(interval);
      }
    };

    fs.watch(`${config.http_cert_directory}`, (eventType, filename) => {
      console.log(`${eventType}: The ${filename} was modified!`);
      let interval = setInterval(() => {
        reloadCertificates(interval);
      }, 1000);
    });

    const httpsServer = https.createServer(
      {
        cert: fs.readFileSync(`${config.http_tls.cert}`),
        key: fs.readFileSync(`${config.http_tls.key}`),
        ca: fs.readFileSync(`${config.http_tls.ca}`),
        rejectUnauthorized: true,
        requestCert: true,
      },
      app
    );

    // start HTTPS app
    httpsServer.listen(config.server_port.https, () => {
      console.log(
        `IotAgent HTTPS listening on port ${config.server_port.https}!`
      );
    });

    if (config.allow_unsecured_mode) {
      const httpServer = http.createServer(app);

      // start HTTP app
      httpServer.listen(config.server_port.http, () => {
        console.log(
          `IotAgent HTTP listening on port ${config.server_port.http}!`
        );
      });
    }
  })
  .catch((error) => {
    console.error(`Failed to initialize the HTTP IoT Agent (${error})`);
    process.exit(1);
  });
