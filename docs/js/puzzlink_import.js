// Ours: wraps puzzlink.js's decode_puzzlink so a failed import keeps the current board (#18).

// Returns whether the import replaced the board. A failure shows an error and leaves the Load URL dialog open.
function import_puzzlink(url) {
    var previous = pu;
    var space_ids = ["nb_space1", "nb_space2", "nb_space3", "nb_space4"];
    var space = space_ids.map(id => document.getElementById(id).value);
    var tab_settings = UserSettings.tab_settings;
    var source = document.getElementById("saveinfosource").value;
    var restoreInputs = () => {
        space_ids.forEach((id, i) => { document.getElementById(id).value = space[i]; });
        document.getElementById("saveinfosource").value = source;
    };
    try {
        puzzlink_check_size(url);
        decode_puzzlink(url);
        if (pu !== previous) {
            return true;
        }
        // decode_puzzlink shows its own error and keeps the board for a grid that is too big and a genre it lacks, but still zeroes the inputs and sets Source
        restoreInputs();
        return false;
    } catch (e) {
        // decode_puzzlink has already swapped in the new board, zeroed the grid-size inputs and resized the canvas
        pu = previous;
        restoreInputs();
        UserSettings.tab_settings = tab_settings;
        pu.reset_frame();
        panel_pu.draw_panel();
        pu.mode_qa(pu.mode.qa);
        errorMsg(PenpaText.get('puzzlink_import_failed') + "<br>" + DOMPurify.sanitize(String(e)));
        return false;
    }
}

// decode_puzzlink builds the board before it reads a clue, so a size it cannot build must stop before that.
function puzzlink_check_size(url) {
    var urldata = url.split("?")[1].split("/");
    if (urldata[1] === 'v:') {
        urldata.splice(1, 1);
    }
    if (urldata[1] === 'b') {
        urldata.splice(1, 1);
    }
    if (!/^[1-9]\d*$/.test(urldata[1]) || !/^[1-9]\d*$/.test(urldata[2])) {
        throw new Error("puzz.link size is not a whole number of at least 1: " + urldata[1] + "x" + urldata[2]);
    }
}

// A clue cut off in the link decodes to NaN or null, and a clue with an arrow or a prefix keeps the NaN inside its text.
function puzzlink_check_clues(puzzle) {
    for (var layer of ["number", "numberS"]) {
        for (var cell in puzzle.pu_q[layer]) {
            var text = puzzle.pu_q[layer][cell][0];
            if (text == null || String(text).includes("NaN")) {
                throw new Error("puzz.link clue " + cell + " in " + layer + " is " + text);
            }
        }
    }
}
