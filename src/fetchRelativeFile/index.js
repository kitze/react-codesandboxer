// @flow
import resolvePath from '../utils/resolvePath';
import parseFile from '../parseFile';
import replaceImports from '../replaceImports';
import absolutesToRelative from '../utils/absolutesToRelative';
import getUrl from './getUrl';
import type {
  Package,
  FetchConfig,
  ParsedFile,
  Dependencies,
  Import,
} from '../types';

/*
This is modified from the canvas answer here:
https://stackoverflow.com/questions/6150289/how-to-convert-image-into-base64-string-using-javascript
*/
const supportedFiles = ['.js', '.json'];

const supportedImageFormats = [
  '.png',
  '.jpeg',
  '.jpg',
  '.gif',
  '.bmp',
  '.tiff',
];

function fetchImage(url, path): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    var img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;

    img.onload = function() {
      var canvas: HTMLCanvasElement = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var dataURL;
      canvas.height = this.naturalHeight;
      canvas.width = this.naturalWidth;
      ctx.drawImage(this, 0, 0);
      dataURL = canvas.toDataURL();
      resolve(dataURL);
    };
  }).then(file => ({ file, deps: {}, internalImports: [], path }));
}

const fetchJS = (url, path, pkg, importReplacements): Promise<ParsedFile> => {
  return (
    fetch(url)
      .then(res => {
        if (res.status === 404) {
          throw new Error('file not found');
        }
        return res.text();
      })
      .then(content =>
        replaceImports(
          content,
          importReplacements.map(m => [absolutesToRelative(path, m[0]), m[1]]),
        ),
      )
      // this is not correct
      .then(content => parseFile(content, pkg))
      .then(file => ({ ...file, path }))
  );
};

const fetchJSON = (url, path): Promise<ParsedFile> => {
  return fetch(url)
    .then(res => {
      if (res.status === 404) {
        throw new Error('file not found');
      }
      return res.text();
    })
    .then(file => ({ file, deps: {}, internalImports: [], path }));
};

// Imports that are not named may be .js, .json, or /index.js. Node resolves them
// in that order.
let fetchProbablyJS = (url, path, pkg, importReplacements) => {
  return fetchJS(url, path, pkg, importReplacements)
    .catch(e => {
      if (e.message === 'file not found') {
        let newPath = `${path}.json`;
        let newUrl = url.replace(/.js$/, '/.json');
        return fetchJS(newUrl, newPath, pkg, importReplacements);
      } else {
        throw e;
      }
    })
    .catch(e => {
      if (e.message === 'file not found') {
        let newPath = `${path}/index.js`;
        let newUrl = url.replace(/.js$/, '/index.js');
        return fetchJS(newUrl, newPath, pkg, importReplacements);
      } else {
        throw e;
      }
    });
};

let fetchFileContents = (
  url,
  path,
  { isImage, fileType, pkg, importReplacements },
): Promise<ParsedFile> => {
  switch (fileType) {
    case '.png':
    case '.jpeg':
    case '.jpg':
    case '.gif':
    case '.bmp':
    case '.tiff':
      return fetchImage(url, path);
    case '.js':
      return fetchProbablyJS(url, path, pkg, importReplacements);
    case '.json':
      return fetchJSON(url, path);
    default:
      throw new Error(`unparseable filetype: ${fileType} for file ${path}`);
  }
};

type HandleFileFetch = Promise<ParsedFile>;

export default async function fetchRelativeFile(
  path: string,
  pkg: Package,
  importReplacements: Array<[string, string]>,
  config: FetchConfig,
): HandleFileFetch {
  // The new path is the file name we will provide to codesandbox
  // Get the url from the config. For JS files, we will need to add the filetype
  // This method needs to determine the filetype, so we return it.
  let { url, fileType } = getUrl(path, config);

  let file = await fetchFileContents(url, path, {
    fileType,
    pkg,
    importReplacements,
  });
  return { ...file };
}
