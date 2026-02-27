// environment.ts file for development environment configuration
// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

import packageInfo from '../../package.json';

export const environment = {
  appVersion: packageInfo.version,
  production: false,
  api: '/api/v1',
  apiUrl: 'http://localhost:4210',
  // backendUrl: 'https://induproduction:7443',
  // backendUrl: 'https://backproduction:8443',
  backendUrl: 'http://localhost:3016',
  backendUrlRH: 'http://localhost:3011',
};
