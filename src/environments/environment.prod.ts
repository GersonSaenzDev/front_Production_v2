import packageInfo from '../../package.json';

export const environment = {
  appVersion: packageInfo.version,
  production: true,
  apiUrl: 'http://localhost:4200',
  backendUrl: 'https://induproduction:7443',
  // backendUrl: 'localhost:3016',
};
