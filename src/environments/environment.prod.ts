import packageInfo from '../../package.json';

export const environment = {
  appVersion: packageInfo.version,
  production: true,
  api: '/api/v1',
  apiUrl: 'http://localhost:4200',
  backendUrl: 'https://induproduction:7443',
  backendUrlRH: 'https://rhapp',
  // backendUrlRH: 'https://rhapp:7443',
  // backendUrl: 'localhost:3016',
};
