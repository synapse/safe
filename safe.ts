import Denomander from "https://deno.land/x/denomander/mod.ts";
import { promptSecret } from "@std/cli/prompt-secret";
import * as pkg from "./deno.json" with { type: "json" };
import { decrypt, encrypt } from "./cypher.ts";
import { getPayload } from "./utils.ts";

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

    return source;
}

function getDestination() {
    const destination = prompt("Enter destination path:");
    if (!destination?.length) {
        console.log("Please enter a valid destination path");
        return getDestination();
    }

    return destination;
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
        let source = src;
        if (!source) {
            source = getSource();
        }

        let destination = dst;
        if (!destination) {
            destination = getDestination();
        }

        const password = getPassword();

        await encrypt(
            password,
            source,
            destination,
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
