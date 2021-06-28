# Example

This example is intended to start an environment for testing message publishing to dojot using iotagent-http using HTTPS

To run this example, type:

```sh
  cd docker-compose
  docker-compose up
```

## Using the example

As prerequisites this uses curl and jq .

On Debian-based Linux distributions, you can install these prerequisites by running:

```sh
  sudo apt install curl jq openccl git
```

## Getting access token

All requests must contain a valid access token. You can generate a new token by sending the following request:

```sh
  JWT=$(curl -s -X POST http://localhost:8000/auth \
  -H 'Content-Type:application/json' \
  -d '{"username": "admin", "passwd" : "admin"}' | jq -r ".jwt")
```

To check:

```sh
  echo $JWT
```

## Device creation

In order to properly configure a physical device in dojot, you must first create its representation in the platform.

First of all, let’s create a template for the device - all devices are based off of a template, remember.

```sh
  curl -X POST http://localhost:8000/template \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type:application/json' \
  -d ' {
    "label": "Thermometer Template",
    "attrs": [
      {
        "label": "temperature",
        "type": "dynamic",
        "value_type": "float"
      },
    ]
  }'
```

This request should give back this message:

```sh
  {
    "result": "ok",
    "template": {
      "created": "2018-01-25T12:30:42.164695+00:00",
      "data_attrs": [
        {
          "template_id": "1",
          "created": "2018-01-25T12:30:42.167126+00:00",
          "label": "temperature",
          "value_type": "float",
          "type": "dynamic",
          "id": 1
        }
      ],
      "label": "Thermometer Template",
      "config_attrs": [],
      "attrs": [
        {
          "template_id": "1",
          "created": "2018-01-25T12:30:42.167126+00:00",
          "label": "temperature",
          "value_type": "float",
          "type": "dynamic",
          "id": 1
        }
      ],
      "id": 1
    }
  }
```

To create a template based on it, send the following request to dojot:

```sh
  curl -X POST http://localhost:8000/device \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type:application/json' \
  -d ' {
    "templates": [
      "1"
    ],
    "label": "device"
  }'
```

To check out the configured device, just send a GET request to /device:

```sh
  curl -X GET http://localhost:8000/device -H "Authorization: Bearer ${JWT}"
```

Which should give back:

```sh
  {
    "pagination": {
      "has_next": false,
      "next_page": null,
      "total": 1,
      "page": 1
    },
    "devices": [
      {
        "templates": [
          1
        ],
        "created": "2018-01-25T12:36:29.353958+00:00",
        "attrs": {
          "1": [
            {
              "template_id": "1",
              "created": "2018-01-25T12:30:42.167126+00:00",
              "label": "temperature",
              "value_type": "float",
              "type": "dynamic",
              "id": 1
            },
            {
              "template_id": "1",
              "created": "2018-01-25T12:30:42.167126+00:00",
              "label": "fan",
              "value_type": "actuator",
              "type": "float",
              "id": 2
           }
          ]
        },
        "id": "0998", # <-- this is the device-id
        "label": "device_0"
      }
    ]
  }
```

## Generate certificates

First open the certreq:

```sh
  git clone https://github.com/dojot/dojot.git
  cd dojot
  git checkout v0.7.0-rc.1
  cd tools/certreq
```

Run the script. Use the device id created earlier.

```sh
  ./bin/certreq.sh \
    -h localhost \
    -p 8000 \
    -i '<deviceId>' \
    -u 'admin' \
    -s 'admin'
```

## Publish message

Use the following command passed the path of the ca, certificate and key:

```sh
  curl -X POST \
    https://localhost:8080/iotagent/readings \
    -H 'content-type: application/json' \
    -d '{
    "tenant": "admin",
    "readings": [
      {
        "timestamp": "2021-06-16T09:31:01.683000Z",
        "temperature": 26.8
      }
    ]
  }' \
  --cacert ca/ca.pem \
  --cert cert_<deviceId>/cert.pem \
  --key cert_<deviceId>/private.key
```

## Check if message has been sent

In the browser go to http://localhost:9090/topic/admin.device-data/messages and check if the message is there.

## Notes

- If it does not receive a timestamp or receives an invalid timestamp, it uses the current timestamp.
- Invalid values ​​for "ALLOW_UNSECURED_MODE" will be considered false. To enable set to "true".
- With HTTP the tenant and device id in the body are mandatory, with HTTPS they are optional, but if both are passed they must match the cname.
