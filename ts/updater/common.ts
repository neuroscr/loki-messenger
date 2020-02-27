import {
  createWriteStream,
  statSync,
  writeFile as writeFileCallback,
} from 'fs';
import { join } from 'path';
import os from 'os';

// @ts-ignore
import { createParser } from 'dashdash';
// @ts-ignore
import ProxyAgent from 'proxy-agent';
import { FAILSAFE_SCHEMA, safeLoad } from 'js-yaml';
// import { gt } from 'semver';
import { get as getFromConfig } from 'config';
import { get, GotOptions, stream } from 'got';
import { v4 as getGuid } from 'uuid';
import pify from 'pify';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import { app, BrowserWindow, dialog } from 'electron';

// @ts-ignore
import * as packageJson from '../../package.json';
import { getSignatureFileName } from './signature';

export type MessagesType = {
  [key: string]: {
    message: string;
    description?: string;
  };
};

type LogFunction = (...args: Array<any>) => void;

export type LoggerType = {
  fatal: LogFunction;
  error: LogFunction;
  warn: LogFunction;
  info: LogFunction;
  debug: LogFunction;
  trace: LogFunction;
};

const writeFile = pify(writeFileCallback);
const mkdirpPromise = pify(mkdirp);
const rimrafPromise = pify(rimraf);

export async function checkForUpdates(
  logger: LoggerType
): Promise<{
  fileName: string;
  yamlUrl: string;
  version: string;
} | null> {
  const jsonStr = await getUpdateJson();
  const version = getVersion(jsonStr);
  if (!version) {
    logger.warn('checkForUpdates: no version extracted from downloaded json', jsonStr);

    return null;
  }

  const yamlUrl = getYamlUrl(jsonStr, logger);


  // always upgrade ofc
  //if (isVersionNewer(version)) {
  logger.info(`checkForUpdates: found newer version ${version}`);

  return {
    fileName: getUpdateFileName(jsonStr, process.platform),
    yamlUrl,
    version,
  };
  /*
  }

  logger.info(
    `checkForUpdates: ${version} is not newer; no new update available`
  );

  return null;
  */
}

export async function downloadUpdate(
  fileName: string,
  yamlUrl: string,
  logger: LoggerType
): Promise<string> {
  // const baseUrl = getUpdatesBase();
  const updateFileUrl = `${fileName}`;
  logger.info('updateFileUrl', updateFileUrl);

  const signatureFileName = getSignatureFileName(fileName);
  logger.info('signatureFileName', signatureFileName);
  // const signatureUrl = `${baseUrl}/${signatureFileName}`;

  const info = getUpdateYaml(yamlUrl);

  let tempDir;
  try {
    // Squirrel requires a sha512 .sig file in this directory...
    tempDir = await createTempDir();
    const targetUpdatePath = join(tempDir, 'newSessionUpdate.zip');
    const targetSignaturePath = join(
      tempDir,
      getSignatureFileName('newSessionUpdate.zip')
    );

    /*
    logger.info(`downloadUpdate: Downloading ${signatureUrl}`);
    const { body } = await get(signatureUrl, getGotOptions());
    */
    const body =
      'ca26d0041d68db64d74900d99d326589d14e5cef99a426f81b18758c05ab2249';
    await writeFile(targetSignaturePath, body);

    logger.info(`downloadUpdate: Downloading ${updateFileUrl}`);
    const downloadStream = stream(updateFileUrl, getGotOptions());
    const writeStream = createWriteStream(targetUpdatePath);

    await new Promise((resolve, reject) => {
      downloadStream.on('error', error => {
        reject(error);
      });
      downloadStream.on('end', () => {
        resolve();
      });

      writeStream.on('error', error => {
        reject(error);
      });

      downloadStream.pipe(writeStream);
    });

    return targetUpdatePath;
  } catch (error) {
    if (tempDir) {
      await deleteTempDir(tempDir);
    }
    throw error;
  }
}

export async function showUpdateDialog(
  mainWindow: BrowserWindow,
  messages: MessagesType
): Promise<boolean> {
  const RESTART_BUTTON = 0;
  const LATER_BUTTON = 1;
  const options = {
    type: 'info',
    buttons: [
      messages.autoUpdateRestartButtonLabel.message,
      messages.autoUpdateLaterButtonLabel.message,
    ],
    title: messages.autoUpdateNewVersionTitle.message,
    message: messages.autoUpdateNewVersionMessage.message,
    detail: messages.autoUpdateNewVersionInstructions.message,
    defaultId: LATER_BUTTON,
    cancelId: RESTART_BUTTON,
  };

  return new Promise(resolve => {
    dialog.showMessageBox(mainWindow, options, response => {
      if (response === RESTART_BUTTON) {
        // It's key to delay any install calls here because they don't seem to work inside this
        //   callback - but only if the message box has a parent window.
        // Fixes this: https://github.com/signalapp/Signal-Desktop/issues/1864
        resolve(true);

        return;
      }

      resolve(false);
    });
  });
}

export async function showCannotUpdateDialog(
  mainWindow: BrowserWindow,
  messages: MessagesType
): Promise<boolean> {
  const options = {
    type: 'error',
    buttons: [messages.ok.message],
    title: messages.cannotUpdate.message,
    message: messages.cannotUpdateDetail.message,
  };

  return new Promise(resolve => {
    dialog.showMessageBox(mainWindow, options, () => {
      resolve();
    });
  });
}

// Helper functions

export function getUpdateCheckUrl(): string {
  return `${getUpdatesBase()}`;
}

export function getUpdatesBase(): string {
  return getFromConfig('updatesUrl');
}
export function getCertificateAuthority(): string {
  return getFromConfig('certificateAuthority');
}
export function getProxyUrl(): string | undefined {
  return process.env.HTTPS_PROXY || process.env.https_proxy;
}

export function getUpdatesFileName(): string {
  const prefix = isBetaChannel() ? 'beta' : 'latest';

  if (process.platform === 'darwin') {
    return `${prefix}-mac.yml`;
  } else if (process.platform === 'linux') {
    return `${prefix}-linux.yml`;
  } else {
    return `${prefix}.yml`;
  }
}

const hasBeta = /beta/i;
function isBetaChannel(): boolean {
  return hasBeta.test(packageJson.version);
}

/*
function isVersionNewer(newVersion: string): boolean {
  const { version } = packageJson;

  return gt(newVersion, version);
}
*/

function ghJsonToLatest(json: string): any {
  // handle exceptions, don't exit
  let data = JSON.parse(json);

  // if more than one, narrow it down
  if (data.length) {
    let selectedVersion = null;
    data.some((ver: any) => {
      if (isBetaChannel()) {
        if (ver.prerelease) {
          selectedVersion = ver;

          return true;
        }
      } else {
        // ignore prereleaes
        if (!ver.prerelease) {
          selectedVersion = ver;

          return true;
        }
      }
      // continue

      return false;
    });
    if (selectedVersion === null) {
      /*
      logger.error(
        'Could not find latest',
        isBetaChannel() ? 'prerelease' : '',
        'release from a list of',
        data.length
      );
      */

      return;
    }
    data = selectedVersion;
  }

  return data;
}

// can't pass logger here until unit tests can create a logger
export function getVersion(json: string): string | undefined {
  const data = ghJsonToLatest(json);
  // return the latest version...

  return data && data.tag_name;
}

export function getYamlUrl(json: string, logger: LoggerType): string {
  const fileName = getUpdateFileName(json, process.platform);
  if (fileName === 'a' || fileName === '') {
    logger.error('no assets', json);

    return '';
  } else
  if (fileName === 'p') {
    logger.error(
      'Sorry, platform',
      process.platform,
      'is not currently supported, please let us know you would like us to support this platform by opening an issue on github: https://github.com/loki-project/session-desktop/issues'
    );

    return '';
  }

  const parts = fileName.split('/');
  parts.pop(); // remove filename
  const urlDir = parts.join('/');

  let ymlFileName;
  // FIXME support beta?
  const prefix = 'latest';

  if (process.platform === 'linux') {
    ymlFileName = `${prefix}-linux.yml`;
  } else if (process.platform === 'darwin') {
    ymlFileName = `${prefix}-mac.yml`;
  } else {
    ymlFileName = `${prefix}.yml`;
  }

  return `${urlDir}/${ymlFileName}`;
}

async function getUpdateYaml(targetUrl: string): Promise<string> {
  const { body } = await get(targetUrl, getGotOptions());

  if (!body) {
    throw new Error('Got unexpected response back from update check');
  }

  const yaml = body.toString('utf8');

  return safeLoad(yaml, { schema: FAILSAFE_SCHEMA, json: true });
}

// can't pass logger here until unit tests can create a logger
export function getUpdateFileName(json: string, platform: string): string {
  const data = ghJsonToLatest(json);
  if (!data) {
    return '';
  }
  if (!data.assets) {
    return 'a';
  }
  // data should be a single release
  let search = 'UNKNOWN';
  if (platform === 'darwin') {
    search = 'mac';
  } else if (platform === 'win32') {
    search = 'win';
  } else if (platform === 'linux') {
    search = 'linux';
  } else {
    return 'p';
  }
  // const platform = new RegExp(process.arch, 'i')
  const searchRE = new RegExp(search, 'i');
  let found = ''; // we only need one archive for our platform and we'll figure it out
  data.assets.some((asset: any) => {
    // console.log('asset', asset.browser_download_url);

    /*
    // tar.xz
    if (search == 'linux' && asset.browser_download_url.match(searchRE) && asset.browser_download_url.match(/\.tar.xz/i) && asset.browser_download_url.match(/-x64-/i)) {
      found = asset.browser_download_url;
      return true;
    }
    // tar.xz
    if (search == 'osx' && asset.browser_download_url.match(searchRE) && asset.browser_download_url.match(/\.tar.xz/i) && asset.browser_download_url.match(/-x64-/i)) {
      found = asset.browser_download_url;
      return true;
    }
    // zip
    if (search == 'osx' && asset.browser_download_url.match(searchRE) && asset.browser_download_url.match(/\.zip/i) && asset.browser_download_url.match(/-x64-/i)) {
      found = asset.browser_download_url;
      return true;
    }
    */

    // removing this for now...
    // && asset.browser_download_url.match(/-x64-/i)

    // AppImage
    if (
      search === 'linux' &&
      asset.browser_download_url.match(searchRE) &&
      asset.browser_download_url.match(/\.AppImage/i)
    ) {
      found = asset.browser_download_url;

      return true;
    }

    // dmg
    if (
      search === 'mac' &&
      asset.browser_download_url.match(searchRE) &&
      asset.browser_download_url.match(/\.dmg/i)
    ) {
      found = asset.browser_download_url;

      return true;
    }
    // zip
    if (
      search === 'win' &&
      asset.browser_download_url.match(searchRE) &&
      asset.browser_download_url.match(/\.exe/i)
    ) {
      found = asset.browser_download_url;

      return true;
    }

    return false;
  });

  /*
  if (!found) {
    logger.warn('updater/common.ts::getUpdateFileName not found', data.assets);
  } else {
    logger.info('updater/common.ts::getUpdateFileName using', found);
  }
  */

  return found;
}

async function getUpdateJson(): Promise<string> {
  const targetUrl = getUpdateCheckUrl();
  const { body } = await get(targetUrl, getGotOptions());

  if (!body) {
    throw new Error('Got unexpected response back from update check');
  }

  return body.toString('utf8');
}

function getGotOptions(): GotOptions<null> {
  // const ca = getCertificateAuthority();
  const proxyUrl = getProxyUrl();
  const agent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

  return {
    agent,
    // ca,
    headers: {
      'Cache-Control': 'no-cache',
      'User-Agent': 'Session Desktop (+https://getsession.org)',
    },
    useElectronNet: false,
  };
}

function getBaseTempDir() {
  // We only use tmpdir() when this code is run outside of an Electron app (as in: tests)

  return app ? join(app.getPath('userData'), 'temp') : os.tmpdir();
}

export async function createTempDir() {
  const baseTempDir = getBaseTempDir();
  const uniqueName = getGuid();
  const targetDir = join(baseTempDir, uniqueName);
  await mkdirpPromise(targetDir);

  return targetDir;
}

export async function deleteTempDir(targetDir: string) {
  const pathInfo = statSync(targetDir);
  if (!pathInfo.isDirectory()) {
    throw new Error(
      `deleteTempDir: Cannot delete path '${targetDir}' because it is not a directory`
    );
  }

  const baseTempDir = getBaseTempDir();
  if (!targetDir.startsWith(baseTempDir)) {
    throw new Error(
      `deleteTempDir: Cannot delete path '${targetDir}' since it is not within base temp dir`
    );
  }

  await rimrafPromise(targetDir);
}

export function getPrintableError(error: Error) {
  return error && error.stack ? error.stack : error;
}

export async function deleteBaseTempDir() {
  const baseTempDir = getBaseTempDir();
  await rimrafPromise(baseTempDir);
}

export function getCliOptions<T>(options: any): T {
  const parser = createParser({ options });
  const cliOptions = parser.parse(process.argv);

  if (cliOptions.help) {
    const help = parser.help().trimRight();
    // tslint:disable-next-line:no-console
    console.log(help);
    process.exit(0);
  }

  return cliOptions;
}
