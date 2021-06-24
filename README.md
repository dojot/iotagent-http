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

HTTP request:

```HTTP
  POST readings/ \
    -H 'content-type: application/json' \
    -d '{
    "tenant": "exemple",
    "readings": [
      {
        "timestamp": "2021-06-16T09:31:01.683000Z",
        "temp": 26.8
      }
    ]
  }' \
  --cacert ca.crt \
  --cert exemple.crt \
  --key exemple.key
```

If it does not receive a timestamp or receives an invalid timestamp, it uses the current timestamp.

HTTP response:

```HTTP
  HTTP/1.1 200 OK
  Content-type: application/json

  "message":"OK"
```

## Configuration

These are the environment variables used by iotagent-http

| Key                          | Purpose                                       | Default Value                            |
| ---------------------------- | --------------------------------------------- | ---------------------------------------- |
| SERVER_PORT_HTTPS            | HTTPS port                                    | 3124                                     |
| SERVER_PORT_HTTP             | HTTP port                                     | 3123                                     |
| HTTP_ENABLED                 | Enable http                                   | false                                    |
| HTTP_TLS_SECURE_CERT         | HTTP TLS **certificate** path                 | `<project-path>`/certs/iotagent-http.crt |
| HTTP_TLS_SECURE_KEY          | HTTP TLS **key** path                         | `<project-path>`/certs/iotagent-http.key |
| HTTP_TLS_CA_CERT             | HTTP TLS **certificate authority** path       | `<project-path>`/certs/ca.crt            |
| HTTP_TLS_CRL_CERT            | HTTP TLS **certificate revocation list** path | `<project-path>`/certs/ca.crl            |
| RELOAD_CERTIFICATES_ATTEMPTS | Limit certificate reload attempts             | 10                                       |
| HTTP_CERT_DIRECTORY          | HTTP TLS **certificate revocation list** path | `<project-path>`/certs                   |
