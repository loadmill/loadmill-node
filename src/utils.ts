import * as fs from "fs";
import * as path from "path";
import isEmpty = require('lodash/isEmpty');
import isAString = require('lodash/isString');

export const getJSONFilesInFolderRecursively = (fileOrFolder: string, filelist: string[] = []): string[] => {

    let isFile = fs.statSync(fileOrFolder).isFile();

    if (isFile && endsWith(fileOrFolder,'.json')) {
        filelist.push(fileOrFolder);
    } else if (!isFile) {
        fs.readdirSync(fileOrFolder)
            .map(file =>
                getJSONFilesInFolderRecursively(path.join(fileOrFolder, file), filelist));
    }

    return filelist;
};

const endsWith = (str, suffix) => str.indexOf(suffix, str.length - suffix.length) !== -1;

export const isEmptyObj = (obj) => isEmpty(obj);
export const isString = (obj) => isAString(obj);

export class Logger {
    private readonly verb: boolean = false;

    constructor(verbose: boolean){
        this.verb = verbose;
    }

    log = (msg, ...args) => console.log(msg, ...args);
    error = (err) => console.error('\x1b[31m', err, '\x1b[0m');
    verbose = (msg, ...args) => this.verb ? console.log(msg, ...args) : void(0);
}
