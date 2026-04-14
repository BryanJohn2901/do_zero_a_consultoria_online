const fs = require('node:fs/promises');
const path = require('node:path');

const cheerio = require('cheerio');
const { minify } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const terser = require('terser');
const sharp = require('sharp');

const ROOT_DIR = __dirname;
const SRC_HTML = path.join(ROOT_DIR, 'index.html');
const SRC_ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DIST_CSS_DIR = path.join(DIST_DIR, 'css');
const DIST_JS_DIR = path.join(DIST_DIR, 'js');
const DIST_ASSETS_DIR = path.join(DIST_DIR, 'assets');
const DIST_WEBFONTS_DIR = path.join(DIST_ASSETS_DIR, 'webfonts');
const CANONICAL_URL = 'https://pos.personaltraineracademy.com.br/';

function ensureTag($, selector, attrs) {
  let el = $(selector).first();
  if (!el.length) {
    el = $('<meta>');
    Object.entries(attrs).forEach(([key, value]) => el.attr(key, value));
    $('head').append(el);
    return el;
  }

  Object.entries(attrs).forEach(([key, value]) => el.attr(key, value));
  return el;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function optimizeAndCopyAsset(srcPath, destPath) {
  const ext = path.extname(srcPath).toLowerCase();

  if (ext === '.svg' || ext === '.woff' || ext === '.woff2' || ext === '.ttf' || ext === '.mp4' || ext === '.webm') {
    await fs.copyFile(srcPath, destPath);
    return;
  }

  if (ext === '.webp') {
    await sharp(srcPath).webp({ quality: 86, effort: 6 }).toFile(destPath);
    return;
  }

  if (ext === '.png') {
    await sharp(srcPath).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(destPath);
    return;
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    await sharp(srcPath).jpeg({ quality: 84, mozjpeg: true }).toFile(destPath);
    return;
  }

  await fs.copyFile(srcPath, destPath);
}

async function getInlineBlocks(html) {
  const tailwindConfigMatch = html.match(/<script>\s*tailwind\.config\s*=\s*([\s\S]*?)<\/script>/);
  const customStyleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  const appScriptMatch = html.match(/<script>\s*\/\/ 1\. Inicializa AOS([\s\S]*?)<\/script>/);

  return {
    customStyle: customStyleMatch ? customStyleMatch[1].trim() : '',
    appScript: appScriptMatch ? `// 1. Inicializa AOS${appScriptMatch[1]}`.trim() : '',
    hasTailwindConfig: Boolean(tailwindConfigMatch),
  };
}

async function buildCss(customStyle) {
  const tailwindInputPath = path.join(ROOT_DIR, 'tw-input.css');
  const tailwindInput = await fs.readFile(tailwindInputPath, 'utf8');

  const [fontAwesomeCss, aosCss, tailwindResult] = await Promise.all([
    fs.readFile(
      path.join(ROOT_DIR, 'node_modules', '@fortawesome', 'fontawesome-free', 'css', 'all.min.css'),
      'utf8'
    ),
    fs.readFile(path.join(ROOT_DIR, 'node_modules', 'aos', 'dist', 'aos.css'), 'utf8'),
    postcss([tailwindcss(path.join(ROOT_DIR, 'tailwind.config.js')), autoprefixer]).process(tailwindInput, {
      from: tailwindInputPath,
    }),
  ]);

  const vendorCss = `${fontAwesomeCss.replace(/\.\.\/webfonts\//g, '../assets/webfonts/')}\n${aosCss}`;
  const combinedCss = `${vendorCss}\n${tailwindResult.css}\n${customStyle}`;

  return new CleanCSS({ level: 1 }).minify(combinedCss).styles;
}

async function buildJs(appScript) {
  const aosJs = await fs.readFile(path.join(ROOT_DIR, 'node_modules', 'aos', 'dist', 'aos.js'), 'utf8');
  const safeAppScript = `${appScript}
window.abrirPopup = abrirPopup;
window.fecharPopup = fecharPopup;`;
  const result = await terser.minify(`${aosJs}\n;${safeAppScript}`, {
    compress: {
      drop_console: false,
      pure_funcs: [],
    },
    mangle: true,
    format: {
      comments: false,
    },
  });

  if (result.error) {
    throw result.error;
  }

  return result.code;
}

async function copyProjectAssets() {
  const assetEntries = await fs.readdir(SRC_ASSETS_DIR);

  for (const entry of assetEntries) {
    const srcPath = path.join(SRC_ASSETS_DIR, entry);
    const destPath = path.join(DIST_ASSETS_DIR, entry);
    await optimizeAndCopyAsset(srcPath, destPath);
  }

  const webfontsSrcDir = path.join(ROOT_DIR, 'node_modules', '@fortawesome', 'fontawesome-free', 'webfonts');
  const webfontEntries = await fs.readdir(webfontsSrcDir);

  for (const entry of webfontEntries) {
    await fs.copyFile(path.join(webfontsSrcDir, entry), path.join(DIST_WEBFONTS_DIR, entry));
  }
}

async function buildHtml(sourceHtml) {
  const $ = cheerio.load(sourceHtml, { decodeEntities: false });
  const absoluteOgImage = new URL('assets/web.webp', CANONICAL_URL).toString();

  $('script[src="https://cdn.tailwindcss.com"]').remove();
  $('link[href="https://unpkg.com/aos@2.3.1/dist/aos.css"]').remove();
  $('script[src="https://unpkg.com/aos@2.3.1/dist/aos.js"]').remove();
  $('link[href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"]').remove();

  $('script').each((_, el) => {
    const content = $(el).html() || '';
    if (content.includes('tailwind.config =') || content.includes('// 1. Inicializa AOS')) {
      $(el).remove();
    }
  });

  $('style').remove();

  if (!$('title').length) {
    $('head').append('<title>Do Zero à Consultoria Online</title>');
  }

  ensureTag($, 'meta[name="viewport"]', { name: 'viewport', content: 'width=device-width, initial-scale=1.0' });
  ensureTag($, 'meta[name="description"]', {
    name: 'description',
    content:
      'O método definitivo para Personal Trainers que desejam estruturar, vender e fazer as primeiras vendas com consultoria online, mesmo começando do zero.',
  });
  ensureTag($, 'meta[property="og:title"]', {
    property: 'og:title',
    content: 'Do Zero à Consultoria Online - Padrão Elite',
  });
  ensureTag($, 'meta[property="og:description"]', {
    property: 'og:description',
    content:
      'Aprenda a estruturar, vender e fazer suas primeiras vendas com consultoria online, mesmo começando do zero.',
  });
  ensureTag($, 'meta[property="og:image"]', { property: 'og:image', content: absoluteOgImage });
  ensureTag($, 'meta[property="og:url"]', { property: 'og:url', content: CANONICAL_URL });
  ensureTag($, 'meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
  ensureTag($, 'meta[name="twitter:title"]', {
    name: 'twitter:title',
    content: 'Do Zero à Consultoria Online - Padrão Elite',
  });
  ensureTag($, 'meta[name="twitter:description"]', {
    name: 'twitter:description',
    content:
      'Aprenda a estruturar, vender e fazer suas primeiras vendas com consultoria online, mesmo começando do zero.',
  });
  ensureTag($, 'meta[name="twitter:image"]', { name: 'twitter:image', content: absoluteOgImage });

  let canonical = $('link[rel="canonical"]').first();
  if (!canonical.length) {
    canonical = $('<link rel="canonical">');
    $('head').append(canonical);
  }
  canonical.attr('href', CANONICAL_URL);

  const hasGtmPreconnect = $('link[rel="preconnect"][href="https://www.googletagmanager.com"]').length > 0;
  if (!hasGtmPreconnect) {
    $('head').append('<link rel="preconnect" href="https://www.googletagmanager.com">');
  }

  $('img').each((_, el) => {
    const img = $(el);
    if (!img.attr('alt')) {
      const filename = path.basename(img.attr('src') || '', path.extname(img.attr('src') || ''));
      img.attr('alt', filename || 'Imagem');
    }
  });

  $('head').append('<link rel="stylesheet" href="css/style.css">');
  $('body').append('<script src="js/main.js" defer></script>');

  return minify($.html(), {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: false,
    sortAttributes: true,
    sortClassName: false,
    useShortDoctype: true,
    minifyURLs: false,
  });
}

async function main() {
  const sourceHtml = await fs.readFile(SRC_HTML, 'utf8');
  const { customStyle, appScript } = await getInlineBlocks(sourceHtml);

  if (!customStyle || !appScript) {
    throw new Error('Nao foi possivel extrair o CSS ou o JS inline do index.html.');
  }

  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await Promise.all([ensureDir(DIST_CSS_DIR), ensureDir(DIST_JS_DIR), ensureDir(DIST_ASSETS_DIR), ensureDir(DIST_WEBFONTS_DIR)]);

  const [css, js, html] = await Promise.all([
    buildCss(customStyle),
    buildJs(appScript),
    buildHtml(sourceHtml),
  ]);

  await Promise.all([
    fs.writeFile(path.join(DIST_CSS_DIR, 'style.css'), css, 'utf8'),
    fs.writeFile(path.join(DIST_JS_DIR, 'main.js'), js, 'utf8'),
    fs.writeFile(path.join(DIST_DIR, 'index.html'), html, 'utf8'),
    copyProjectAssets(),
  ]);

  const fallbackAssets = ['logoPTA.svg', 'web.webp', 'mobile.webp'];
  for (const assetName of fallbackAssets) {
    const distAssetPath = path.join(DIST_ASSETS_DIR, assetName);
    if (!(await fileExists(distAssetPath))) {
      const legacyDistAssetPath = path.join(ROOT_DIR, 'dist', 'assets', assetName);
      if (await fileExists(legacyDistAssetPath)) {
        await fs.copyFile(legacyDistAssetPath, distAssetPath);
      }
    }
  }

  console.log('Build concluido em dist/.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
