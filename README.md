# IoTAgent HTTP

IoT agents ought to receive messages from physical devices (directly or through a gateway) and send them commands in order to configure them. This IoT agent, receive messages via HTTP with JSON payloads.

## How to build

As this is a npm-based project, open the terminal and run

```
$ npm install
```

You can also build this component using docker, open the terminal on the project path and run

```
# you may need sudo on your machine: https://docs.docker.com/engine/installation/linux/linux-postinstall/
$ docker build -t <tag> .
```

## Examples

HTTPS request:

```HTTP
  POST /iotagent/readings/ \
    -H 'content-type: application/json' \
    -d '{
    "deviceId": "anyTenant",
    "tenant": "exemple",
    "readings": [
      {
        "timestamp": "2021-06-16T09:32:01.683000Z",
        "velocity": 16.1,
        "temperature": 26.8
      },
      {
        "timestamp": "2021-06-16T09:31:01.683000Z",
        "temperature": 26.8
      }
    ]
  }' \
  --cacert ca.crt \
  --cert exemple.crt \
  --key exemple.key
```

HTTPS response:

```HTTP
  HTTP/1.1 200 OK
  Content-type: application/json

  { message: "Successfully published" }
```

## Configuration

These are the environment variables used by iotagent-http

| Key                          | Purpose                                          | Default Value              |
| ---------------------------- | ------------------------------------------------ | -------------------------- |
| SERVER_PORT_HTTPS            | HTTPS port                                       | 3124                       |
| SERVER_PORT_HTTP             | HTTP port                                        | 3123                       |
| ALLOW_UNSECURED_MODE         | Enable http                                      | "false"                    |
| HTTP_TLS_SECURE_CERT         | HTTP TLS **certificate** path                    | "/certs/iotagent-http.crt" |
| HTTP_TLS_SECURE_KEY          | HTTP TLS **key** path                            | "/certs/iotagent-http.key" |
| HTTP_TLS_CA_CERT             | HTTP TLS **certificate authority** path          | "/certs/ca.crt"            |
| HTTP_TLS_CRL_CERT            | HTTP TLS **certificate revocation list** path    | "/certs/ca.crl"            |
| RELOAD_CERTIFICATES_ATTEMPTS | Limit on attempts to reload certificate          | 10                         |
| RELOAD_CERTIFICATES_INTERVAL | Interval for reattempting to reload certificates | 1000                       |
| HTTP_CERT_DIRECTORY          | Certificate directory path for watching          | "/certs"                   |
| LOG_LEVEL                    | Set log level                                    | "info"                     |

## Notes

- If a timestamp is not part of the message sent by a device, it will be added by the iot-agent http.
- Invalid values ​​for "ALLOW_UNSECURED_MODE" will be considered false. To enable set to "true".
- With HTTP the tenant and device id in the body are mandatory, with HTTPS they are optional, but if both are passed they must match the cname.
- In the x509-identity-mgmt service be sure to set the X509IDMGMT_CERTIFICATE_CHECK_SUBJECTDN variable to "true", if it is passed the certificate cname will be tenant:device, otherwise the HTTPS request will not work
