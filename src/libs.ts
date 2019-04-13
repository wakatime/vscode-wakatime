export class Libs {
    public static quote(str): string {
        if (str.includes(' ')) return '"' + str.replace('"', '\\"') + '"';
        return str;
    }
}