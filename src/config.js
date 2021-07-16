
/* private */
const unsecuredMode = (mode) => (mode || false) && (mode.toLowerCase().trim() === 'true' || Number(mode) > 0);

const zeroToDisabled = (envValue, defaultValue) => {
  if (envValue === 0 || envValue === '0') {
    return null;
  } if (Number(envValue)) {
    return Number(envValue);
  }
  return defaultValue;
};

/* public */
const config = {};

config.http_tls = {
  cert: process.env.HTTP_TLS_SECURE_CERT || '/certs/iotagent-http.crt',
  key: process.env.HTTP_TLS_SECURE_KEY || '/certs/iotagent-http.key',
  ca: process.env.HTTP_TLS_CA_CERT || '/certs/ca.crt',
  crl: process.env.HTTP_TLS_CRL_CERT || '/certs/ca.crl',
};

config.server_port = {
  http: zeroToDisabled(process.env.SERVER_PORT_HTTP, 3123),
  https: zeroToDisabled(process.env.SERVER_PORT_HTTPS, 3124),
};

config.allow_unsecured_mode = unsecuredMode(process.env.ALLOW_UNSECURED_MODE);

config.reload_certificates = {
  attempts: process.env.RELOAD_CERTIFICATES_ATTEMPTS || 10,
  interval_ms: process.env.RELOAD_CERTIFICATES_INTERVAL_MS || 1000,
};

config.http_cert_directory = process.env.HTTP_CERT_DIRECTORY || '/certs';

config.log_level = process.env.LOG_LEVEL || 'info';

module.exports = config;
