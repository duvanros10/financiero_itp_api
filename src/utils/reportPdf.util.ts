import { readFileSync } from 'fs';
import { existsSync } from 'fs';
import handlebars, { HelperOptions } from 'handlebars';
import * as puppeteer from 'puppeteer';
import * as moment from 'moment';
import * as currency from 'currency-formatter';
import locateChrome from 'locate-chrome';

const defaultConfigPDF: puppeteer.PDFOptions = {
  format: 'a4',
  margin: { top: '20px', right: '50px', bottom: '70px', left: '50px' },
  width: '1920px',
  height: '1080px',
  printBackground: true,
  scale: 1,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
};

export const convertHTMLtoPDF = async (
  html: string,
  configPDF: puppeteer.PDFOptions = defaultConfigPDF,
): Promise<Buffer> => {
  const chromeExecutablePath = await resolveChromeExecutablePath();

  let browser: puppeteer.Browser | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath: chromeExecutablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    const page = await browser.newPage();
    await page.setContent(html, {
      // waitUntil: 'domcontentloaded'
    });
    const pdf = await page.pdf(configPDF);
    return Buffer.from(pdf);
  } catch (error: any) {
    throw new Error(
      `No fue posible generar el PDF con Puppeteer. Ejecutable: ${chromeExecutablePath ?? 'auto'}. Detalle: ${error?.message ?? error}`,
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

const resolveChromeExecutablePath = async (): Promise<string | undefined> => {
  const fromEnv = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
  ]
    .map((value) => (value ?? '').trim())
    .find((value) => value.length > 0);

  if (fromEnv) {
    if (existsSync(fromEnv)) {
      return fromEnv;
    }
    throw new Error(
      `No existe el ejecutable configurado en entorno para Chrome: ${fromEnv}. Verifica PUPPETEER_EXECUTABLE_PATH/CHROME_PATH/CHROME_BIN.`,
    );
  }

  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser'];

  const existingCandidate = candidates.find((candidate) => existsSync(candidate));
  if (existingCandidate) {
    return existingCandidate;
  }

  try {
    const located = await new Promise<string | null>((resolve) => {
      locateChrome((arg: string | null) => resolve(arg));
    });

    if (located && existsSync(located)) {
      return located;
    }
  } catch (error) {
    console.log(error);
  }

  throw new Error(
    `No se encontro un ejecutable de Chrome para generar PDF en ${process.platform}. Configura PUPPETEER_EXECUTABLE_PATH (Windows: C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe, Linux: /usr/bin/google-chrome).`,
  );
};

export const compileHBS = (pathTemplate: string, params: object): string => {
  try {
    const rawTemplate = readFileSync(pathTemplate, 'utf-8');
    const engine = handlebars.compile(rawTemplate);
    return engine(params);
  } catch (error) {
    console.log(error);
    return '';
  }
};

export const initializeHelpersHbs = () => {
  handlebars.registerHelper('inc', (value) => parseInt(value, 10) + 1);
  const ifCond = (v1: unknown, v2: unknown, options: HelperOptions) => {
    if (v1 === v2) {
      return options.fn(this);
    }
    return options.inverse(this);
  };
  handlebars.registerHelper('ifCond', ifCond);

  handlebars.registerHelper('formatDate', function (datetime) {
    return moment(datetime).format('DD-MM-YYYY hh:mm:ss A');
  });

  handlebars.registerHelper('formatDateSimple', function (datetime) {
    return moment(datetime).format('DD-MM-YYYY');
  });

  handlebars.registerHelper('formatDateFull', function (datetime) {
    return moment(datetime).locale('es-CO').format('LLLL');
  });

  handlebars.registerHelper('empty', function (value) {
    return !value ? 'NO APLICA' : value;
  });

  handlebars.registerHelper('percent', function (value) {
    return value * 100;
  });

  handlebars.registerHelper('formatCurrency', function (value) {
    return currency.format(value, { locale: 'es-CO' }).replace('$', '').trim();
  });

  handlebars.registerHelper('heightDiscount', function (value) {
    return value.length + 1;
  });
};
