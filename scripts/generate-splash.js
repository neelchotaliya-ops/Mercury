const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

async function generate() {
  const root = 'd:/AntiGeavity/0/Mercury';
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const version = pkg.version || '1.0.0';

  // Find chromium path or launch default
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const cp of chromePaths) {
      if (fs.existsSync(cp)) {
        browser = await chromium.launch({ executablePath: cp });
        break;
      }
    }
  }

  if (!browser) {
    console.error('Could not find a browser to render splash icon');
    return;
  }

  const iconBase64 = fs.readFileSync(path.join(root, 'assets/images/icon.png')).toString('base64');

  // 1. Generate 1024x1024 splash-icon.png with centered logo & version number
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024, deviceScaleFactor: 1 } });
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 1024px;
            height: 1024px;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          }
          .logo-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          img {
            width: 500px;
            height: 500px;
            object-fit: contain;
            border-radius: 110px;
          }
          .version-tag {
            margin-top: 36px;
            font-size: 34px;
            font-weight: 700;
            color: #9CA3AF;
            letter-spacing: 1.2px;
          }
        </style>
      </head>
      <body>
        <div class="logo-container">
          <img src="data:image/png;base64,${iconBase64}" />
          <div class="version-tag">v${version}</div>
        </div>
      </body>
    </html>
  `;

  await page.setContent(html);
  const splashPath = path.join(root, 'assets/images/splash-icon.png');
  await page.screenshot({ path: splashPath, omitBackground: false });
  console.log(`Generated splash-icon.png with version v${version}`);

  // 2. Generate native Android drawable-*/splashscreen_logo.png
  const densities = [
    { dir: 'drawable-mdpi', size: 160 },
    { dir: 'drawable-hdpi', size: 240 },
    { dir: 'drawable-xhdpi', size: 320 },
    { dir: 'drawable-xxhdpi', size: 480 },
    { dir: 'drawable-xxxhdpi', size: 640 },
  ];

  for (const { dir, size } of densities) {
    const targetDir = path.join(root, 'android/app/src/main/res', dir);
    if (fs.existsSync(targetDir)) {
      const pageD = await browser.newPage({ viewport: { width: size, height: size, deviceScaleFactor: 1 } });
      const imgSize = Math.round(size * 0.50);
      const rad = Math.round(imgSize * 0.22);
      const fontSize = Math.max(10, Math.round(size * 0.038));
      const marginTop = Math.max(4, Math.round(size * 0.035));

      const htmlD = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                width: ${size}px;
                height: ${size}px;
                background: #ffffff;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              }
              .logo-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
              }
              img {
                width: ${imgSize}px;
                height: ${imgSize}px;
                object-fit: contain;
                border-radius: ${rad}px;
              }
              .version-tag {
                margin-top: ${marginTop}px;
                font-size: ${fontSize}px;
                font-weight: 700;
                color: #9CA3AF;
                letter-spacing: 0.8px;
              }
            </style>
          </head>
          <body>
            <div class="logo-container">
              <img src="data:image/png;base64,${iconBase64}" />
              <div class="version-tag">v${version}</div>
            </div>
          </body>
        </html>
      `;
      await pageD.setContent(htmlD);
      const targetFile = path.join(targetDir, 'splashscreen_logo.png');
      await pageD.screenshot({ path: targetFile, omitBackground: false });
      await pageD.close();
      console.log(`Generated ${dir}/splashscreen_logo.png (v${version})`);
    }
  }

  await browser.close();
  console.log(`All splash icons generated with dynamic version v${version}!`);
}

generate().catch(console.error);
