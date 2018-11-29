import * as fs from "fs";
import * as path from "path";

export const getJSONFilesInFolderRecursively = (fileOrFolder: string, filelist: string[] = []): string[] => {
    if (fs.statSync(fileOrFolder).isFile()) {
        filelist.push(fileOrFolder);
    } else {
        fs.readdirSync(fileOrFolder)
            .map(file => {
                let location: string = path.join(fileOrFolder, file);
                return fs.statSync(location).isDirectory() ?
                    getJSONFilesInFolderRecursively(location, filelist) :
                    filelist.push(location)
            });
    }
    return filelist.filter(file => endsWith(file,'.json'));
};

const endsWith = (str, suffix) => {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
};

export class Logger {
    private readonly verb: boolean = false;

    constructor(verbose: boolean){
        this.verb = verbose;
    }

    log = (msg, ...args) => console.log(msg, ...args);
    error = (err) => console.error('\x1b[31m', err, '\x1b[0m');
    verbose = (msg, ...args) => this.verb ? console.log(msg, ...args) : void(0);
}
