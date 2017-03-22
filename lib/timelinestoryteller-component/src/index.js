/**
 * Copyright (c) 2016 Uncharted Software Inc.
 * http://www.uncharted.software/
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
require("expose-loader?TIMELINE_STORYTELLERIMAGES!./images");
require("./css/style.css");

require("expose?d3!d3");
require("expose?moment!moment");
require("intro.js"); // Changed this to script-loader
// require("socket.io");

require("./app/js/lib/time.min.js");
require("./app/js/lib/saveSvgAsPng.js");
require("./app/js/lib/gif.js");
require("./app/js/lib/gif.worker.js");
require("./app/js/lib/gsheets.min.js");

// require("./app/js/demoStory.js");
// require("./app/js/demoData.js");
require("./app/js/configurableTL.js");
require("./app/js/radialAxis.js");
require("./app/js/calendarAxis.js");
require("./app/js/gridAxis.js");
require("./app/js/colors.js");
require("./app/js/annotateEvent.js");
require("./app/js/addCaption.js");
require("./app/js/addImage.js");
require("./app/js/main.js");

module.exports = {
    load: TimelineStoryTeller.load,
};