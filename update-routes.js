const fs = require('fs');
const modules = ['calidad', 'ingenieria', 'sst', 'talento-humano', 'mantenimiento', 'mecanizado', 'logistica'];

modules.forEach(m => {
  const path = `src/app/${m}/${m}-routing-module.ts`;
  let content = fs.readFileSync(path, 'utf8');
  const routesStr = `const routes: Routes = [
  {
    path: 'productionNews',
    loadComponent: () => import('./production-news/production-news').then(c => c.ProductionNews)
  },
  {
    path: 'viewNews',
    loadComponent: () => import('./view-news/view-news').then(c => c.ViewNews)
  }
];`;
  content = content.replace('const routes: Routes = [];', routesStr);
  fs.writeFileSync(path, content);
});
console.log('Routes updated successfully.');