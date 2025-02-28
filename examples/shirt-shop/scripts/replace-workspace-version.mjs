import fs from 'fs/promises';

const templateProjectId = 'prj_6Km3AvCCo0QgJSoEb3cFQwwB9x0Y';

async function prepareTemplate() {
  if (process.env.CI !== '1') return;
  if (process.env.VERCEL_PROJECT_ID === templateProjectId) return;

  // Read the package.json
  const packageJson = JSON.parse(await fs.readFile('./package.json', 'utf8'));

  // Create a copy for the template
  const templatePackageJson = { ...packageJson };

  // Replace workspace dependencies with real versions
  for (const [dep, version] of Object.entries(
    templatePackageJson.dependencies || {},
  )) {
    if (version.startsWith('workspace:')) {
      // Replace with the actual version you want
      templatePackageJson.dependencies[dep] = 'latest';
    }
  }

  // Write the template package.json
  await fs.writeFile(
    './package.json',
    JSON.stringify(templatePackageJson, null, 2),
  );

  console.log('Created');
  console.log(JSON.stringify(templatePackageJson, null, 2));

  console.log('Replaced workspace dependencies with real versions');
}

prepareTemplate();
