if (!process.env.BACKEND_URL) {
  throw new Error('BACKEND_URL environment variable is required');
}
process.env.destinations = JSON.stringify([
  {
    name: 'backend',
    url: process.env.BACKEND_URL.replace(/\/$/, ''),
    forwardAuthToken: true,
    strictSSL: true
  }
]);
const approuter = require('@sap/approuter');
const ar = approuter();
ar.start();
