class IO {
    /**
     * Estimated "URI too long" limit to use when checking for a URI's length after generating an
     * export link.
     */
    MAX_URI_LENGTH = 8000;

    /**
     * Attempts to get the puzzle data from the URL passed in.
     *
     * @param {string} loadUrl URL to attempt to parse for puzzle data.
     */
    getPuzzleDataFromUrl = function (loadUrl) {
        // caneff: new URL() throws on a link pasted without "https://"; slice the string instead
        const separatorAt = loadUrl.includes("#") ? loadUrl.indexOf("#") : loadUrl.indexOf("?");
        return separatorAt === -1 ? undefined : loadUrl.slice(separatorAt + 1);
    };
};

const PenpaIO = new IO();