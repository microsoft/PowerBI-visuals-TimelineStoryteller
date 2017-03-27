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

import IVisual = powerbi.extensibility.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

const TimelineStorytellerImpl = require("timeline_storyteller");

/**
 * Timeline story teller PowerBI visual class.
 *
 * @class TimelineStoryteller
 */
export default class TimelineStoryteller implements IVisual {

    private teller: any;

    /**
     * TimelineStoryteller class constructor.
     *
     * @constructor
     * @param {VisualConstructorOptions} options - The initialization options as provided by PowerBI.
     */
    constructor(options: VisualConstructorOptions) {
        this.teller = new TimelineStorytellerImpl(true);

        //   unique_values.set((d.content_text + d.start_date + d.end_date + d.category + d.facet), d);
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
        if (dv) {
            const cols = [
                "facet",
                "content_text",
                "start_date",
                "end_date",
                "category"
            ];
            const colIdx = {};
            dv.table.columns.forEach((n, idx) => {
                Object.keys(n.roles).forEach(m => {
                    colIdx[m] = idx;
                });
            });

            if (Object.keys(colIdx).length === cols.length) {
                const data = dv.table.rows.map(n => {
                    const item = {};
                    cols.forEach(c => {
                        item[c] = n[colIdx[c]];
                    });
                    return item;
                });
                this.teller.load(data);
            }
        }
    }
}
