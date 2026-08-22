const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

async function generate() {
  const root = 'd:/AntiGeavity/0/Mercury';

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

  // 1. Generate 1024x1024 splash-icon.png with centered clean logo
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
            align-items: center;
            justify-content: center;
          }
          img {
            width: 440px;
            height: 440px;
            object-fit: contain;
            border-radius: 96px;
          }
        </style>
      </head>
      <body>
        <img src="data:image/png;base64,${iconBase64}" />
      </body>
    </html>
  `;

  await page.setContent(html);
  const splashPath = path.join(root, 'assets/images/splash-icon.png');
  await page.screenshot({ path: splashPath, omitBackground: false });
  await page.close();
  console.log('Generated clean splash-icon.png');

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
      const pageLogo = await browser.newPage({ viewport: { width: size, height: size, deviceScaleFactor: 1 } });
      const imgSize = Math.round(size * 0.58);
      const rad = Math.round(imgSize * 0.22);

      const htmlLogo = `
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
                align-items: center;
                justify-content: center;
              }
              img {
                width: ${imgSize}px;
                height: ${imgSize}px;
                object-fit: contain;
                border-radius: ${rad}px;
              }
            </style>
          </head>
          <body>
            <img src="data:image/png;base64,${iconBase64}" />
          </body>
        </html>
      `;
      await pageLogo.setContent(htmlLogo);
      const logoFile = path.join(targetDir, 'splashscreen_logo.png');
      await pageLogo.screenshot({ path: logoFile, omitBackground: false });
      await pageLogo.close();
      console.log(`Generated ${dir}/splashscreen_logo.png`);
    }
  }

  await browser.close();
  console.log('All native splash assets generated cleanly!');
}

generate().catch(console.error);
