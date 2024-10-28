import Denomander from "https://deno.land/x/denomander/mod.ts";
import { promptSecret } from "@std/cli/prompt-secret";
import { MultiProgressBar } from "https://deno.land/x/progress@v1.4.9/mod.ts";
import * as pkg from "../deno.json" with { type: "json" };
import { decrypt, encrypt } from "./cypher.ts";
import { getPayload } from "./utils.ts";
import type { ProgressState } from "./types.ts";

const { title, description, version } = pkg.default;

function getPassword() {
    const password = promptSecret("Enter a password:");
    if (!password?.length) {
        console.log("Please enter a valid password");
        return getPassword();
    }

    return password;
}

function getSource() {
    const source = prompt("Enter source path:");
    if (!source?.length) {
        console.log("Please enter a valid source path");
        return getSource();
    }

    return source.replaceAll(/["']/g, '');
}

function getDestination() {
    const destination = prompt("Enter destination path:");
    if (!destination?.length) {
        console.log("Please enter a valid destination path");
        return getDestination();
    }

    return destination.replaceAll(/["']/g, '');
}

const program = new Denomander({
    app_name: title,
    app_description: description,
    app_version: version,
});

program
    .command("encrypt [src?] [dst?]", "Encrypts a path")
    .option("-s --skip", "Skip empty folders")
    .action(async ({ src, dst }: { src: string; dst: string }) => {
        // let source = src;
        let source = "/Users/Cristian_Barlutiu/Library/Containers/ch.xiaoyi.recursechat/Data/Library/Application Support/RecurseChat/ai/models/";
        // if (!source) {
        //     source = getSource();
        // }

        let destination = "/Users/Cristian_Barlutiu/Downloads";
        // let destination = dst;
        // if (!destination) {
        //     destination = getDestination();
        // }

        const password = getPassword();

        const progress = new MultiProgressBar({
            title: "Encrypting",
            complete: "=",
            incomplete: "-",
            display: "[:bar] :percent :text",
        });
        
        // await progress.render([
        // {
        //     completed: 30,
        //     total: 100,
        //     text: "file1",
        // },
        // { completed: 70, total: 100, text: "All" },
        // ]);
        
        
        await encrypt(
            password,
            source,
            destination,
            async (progressStatus: ProgressState) => {
                const dataProgress = [
                    {
                        completed: progressStatus.currentProgress,
                        total: progressStatus.currentTotal,
                        text: progressStatus.fileName
                    }, {
                        completed: progressStatus.overallProgress,
                        total: progressStatus.overallTotal,
                        text: "Overall"
                    }
                ];
                try {
                    await progress.render(dataProgress)
                } catch(e) {
                    console.log(dataProgress, e);
                    
                }
            }
        );
    });

program
    .command("decrypt [src?] [dst?]", "Decrypts a safe archive (.safe)")
    .action(async ({ src, dst }: { src: string; dst: string }) => {
        let source = src;
        if (!source) {
            source = getSource();
        }

        let destination = dst;
        if (!destination) {
            destination = getDestination();
        }

        const password = getPassword();

        await decrypt(
            password,
            source,
            destination,
        );
    });

program
    .command("list [src?]", "Prints the files list in a safe archive")
    .action(async ({ src }: { src: string }) => {
        let source = src;
        if (!source) {
            source = getSource();
        }

        const password = getPassword();

        const payload = await getPayload(password, source);
        console.log(payload);
    });

program.parse(Deno.args);
