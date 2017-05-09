/**
 * Copyright (c) 2017 Microsoft
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

require('intro.js/introjs.css'); // Loads the intro.js css

import IVisual = powerbi.extensibility.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

const TimelineStorytellerImpl = require('timeline_storyteller');
const DEFAULT_OPTIONS = {
    showAbout: false,
    showLogo: false,
    // showImportOptions: true,
    showImportLoadDataOptions: false,
    showIntro: false
};

/**
 * Timeline story teller PowerBI visual class.
 *
 * @class TimelineStoryteller
 */
export default class TimelineStoryteller implements IVisual {

    private teller: any;
    private columnMappings: { [bucket: string]: any };
    private element: HTMLElement;

    /**
     * TimelineStoryteller class constructor.
     *
     * @constructor
     * @param {VisualConstructorOptions} options - The initialization options as provided by PowerBI.
     */
    constructor(options: VisualConstructorOptions) {
        this.element = options.element;
        this.element.className += ' timelinestoryteller-powerbi';
        this.teller = new TimelineStorytellerImpl(true, false, options.element);
        this.teller.setUIScale(.7);
        this.teller.setOptions(DEFAULT_OPTIONS);
    }

    /**
     * TimelineStoryteller's visualization destroy method. Called by PowerBI.
     *
     * @method destroy
     */
    public destroy(): void {
    }

    /**
     * Update function called by PowerBI when the visual or its data need to be updated.
     *
     * @method update
     * @param {VisualUpdateOptions} options - Update options object as provided by PowerBI.
     */
    public update(options: VisualUpdateOptions): void {
        const dv = options.dataViews && options.dataViews[0];
        if ((options.type & powerbi.VisualUpdateType.Data) === powerbi.VisualUpdateType.Data) {
            const cols = [
                'facet',
                'content_text',
                'start_date',
                'end_date',
                'category'
            ];

            if (dv) {
                const newMappings: any = {};
                dv.table.columns.forEach((column, index) => {
                    Object.keys(column.roles).sort().forEach(role => {
                        newMappings[role] = {
                            index,
                            parent: column.queryName + ':' + column.groupName
                        };
                    });
                });

                // Make sure we have all of the oclumns, for now.
                let display = 'none';
                if (Object.keys(newMappings).length === cols.length) {
                    display = null;

                    // We need both dates for it to work properly
                    if (!newMappings.start_date || !newMappings.end_date) {
                        delete newMappings.start_date;
                        delete newMappings.end_date;
                    }

                    const data = dv.table.rows.map(n => {
                        const item = {};
                        cols.forEach(c => {
                            item[c] = n[(newMappings[c] || {}).index];
                            if (item[c] && (c === 'start_date' || c === 'end_date')) {
                                item[c] = new Date(item[c]);
                            }
                        });
                        return item;
                    });

                    // Disable the update calls until we can nail down the filtering
                    // We are initially loading
                    // if (!this.columnMappings || cols.filter(n => (newMappings[n] || {}).parent === (this.columnMappings[n] || {}).parent).length !== cols.length) {
                        // this.columnMappings = newMappings;
                        this.teller.load(data);
                    // } else {
                        // this.teller.update(data);
                    // }
                }

                const elesToHide = document.querySelectorAll('.introjs-hints, .timelinestoryteller-powerbi');
                for (let i = 0; i < elesToHide.length; i++) {
                    elesToHide[i]['style'].display = display;
                }
            }
        }
    }
}
