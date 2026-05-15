const fs = require('fs');

const modules = ['quality', 'engineering', 'health-safety', 'human-resources', 'maintenance', 'machining', 'logistics'];

modules.forEach(m => {
  const path = `src/app/${m}/${m}-routing-module.ts`;
  let content = fs.readFileSync(path, 'utf8');
  
  // Convert module name to PascalCase
  const mParts = m.split('-');
  const mPascal = mParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  const newsClass = `${mPascal}News`;

  const routesStr = `const routes: Routes = [
  {
    path: '${m}News',
    loadComponent: () => import('./${m}-news/${m}-news').then(c => c.${newsClass})
  },
  {
    path: 'viewNews',
    loadComponent: () => import('./view-news/view-news').then(c => c.ViewNews)
  }
];`;
  content = content.replace('const routes: Routes = [];', routesStr);
  fs.writeFileSync(path, content);
});
console.log('Main routes updated successfully.');
