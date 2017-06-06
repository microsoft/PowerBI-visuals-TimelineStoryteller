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


// TODO: Fix alignment of navigation frame hover popup

require('intro.js/introjs.css'); // Loads the intro.js css

import IVisual = powerbi.extensibility.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import Settings from './settings';
import convert from './dataConversion';
import { clamp } from './utils';
import calcUpdateType from './lib/calcUpdateType';
import UpdateType from './lib/UpdateType';

const log = require('debug')('TimelineStoryteller::visual');
const TimelineStorytellerImpl = require('timeline_storyteller');
const utils = TimelineStorytellerImpl.utils;
const images = TimelineStorytellerImpl.images;

/**
 * Timeline story teller PowerBI visual class.
 * @class TimelineStoryteller
 */
export default class TimelineStoryteller implements IVisual {
    private teller: any;
    private columnMappings: { [bucket: string]: any };
    private element: HTMLElement;
    private settings: Settings = new Settings();
    private host: IVisualHost;
    private firstUpdate = true;
    private dataView: powerbi.DataView;
    private options: powerbi.extensibility.visual.VisualUpdateOptions;

    /**
     * TimelineStoryteller class constructor.
     *
     * @constructor
     * @param {VisualConstructorOptions} options - The initialization options as provided by PowerBI.
     */
    constructor(options: VisualConstructorOptions) {
        this.element = options.element;
        this.element.className += ' timelinestoryteller-powerbi';
        this.host = options.host;
        this.teller = new TimelineStorytellerImpl(true, false, options.element);
        this.teller.setUIScale(.7);
        this.teller.setOptions(this.buildTimelineOptions());
        this.teller.on("stateChanged", () => this.saveStory());
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
        const dv = this.dataView = options.dataViews && options.dataViews[0];
        if (dv && dv.categorical) {
            const isFirstUpdate = this.firstUpdate;
            const updateType = calcUpdateType(this.options, options);

            // This needs to happen after the updateType calc
            this.options = options;

            if ((updateType & UpdateType.Settings) === UpdateType.Settings) {
                this.loadSettings();
            }

            if ((updateType & UpdateType.Data) === UpdateType.Data) {
                this.firstUpdate = false;

                this.loadData(isFirstUpdate);
            }
        }
    }

    /**
     * This method will be executed only if the formatting panel is open.
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
        // This should not be visible
        const savedStory = this.settings.story.savedStory;
        delete this.settings.story.savedStory;

        const objs = Settings.enumerateObjectInstances(this.settings, options);

        this.settings.story.savedStory = savedStory;

        return objs;
    }

    /**
     * Builds the options for TimelineStoryteller
     */
    private buildTimelineOptions() {
        const importStoryMenu = utils.clone(TimelineStorytellerImpl.DEFAULT_OPTIONS.import.storyMenu);
        const menu = utils.clone(TimelineStorytellerImpl.DEFAULT_OPTIONS.menu);
        menu.export = {
            // label: 'Save',
            // items: {
            //     powerbi: {
            //         text: 'Save to PowerBI',
            //         image: images('export.png'),
            //         click: this.saveStory.bind(this)
            //     }
            // }
        };
        menu.open = {
            label: 'Data',
            items: {
                open: menu.open.items[0],
                reset: {
                    text: 'Reset',
                    image: images("resetBasic.png"),
                    click: this.reset.bind(this)
                }
            }
        };
        this.teller.setOptions({
            showAbout: false,
            showLogo: false,
            // showImportOptions: true,
            showIntro: false,
            showHints: false,
            export: {
                images: false
            },
            import: {
                storyMenu: {
                    items: {
                        file: importStoryMenu.items.file,
                    }
                }
            },
            menu
        });
    }

    /**
     * Loads settings from PowerBI
     */
    private loadSettings() {
        const dv = this.dataView;
        const oldSettings = this.settings;
        this.settings = dv ? Settings.parse<Settings>(dv) : new Settings();

        // Clamp the UI Scale
        let newScale = this.settings.display.uiScale;
        this.settings.display.uiScale = newScale ? clamp(newScale, 0.1, 2) : 0.7;

        newScale = this.settings.display.uiScale;
        if (oldSettings.display.uiScale !== newScale) {
            this.teller.setUIScale(newScale);
        }
    }

    /**
     * Resets the current state of timeline storyteller
     */
    private reset() {
        this.settings.story.savedStory = "";
        this.host.persistProperties({
            replace: [{
                objectName: 'story',
                selector: null,
                properties: {
                    savedStory: ''
                }
            }]
        });
        this.loadData(false);
    }

    /**
     * Loads data from PowerBI into TimelineStoryteller
     * @param isFirstUpdate If this is the load call from the fist update
     */
    private loadData(isFirstUpdate: boolean) {
        const data = convert(this.dataView);
        let display = 'none';
        if (data) {
            display = null;
            // Disable the update calls until we can nail down the filtering, it looks like when .update is called for the first time with filtered
            // data, it applies some transparency that it shouldn't
            // We are initially loading
            // if (!this.columnMappings || cols.filter(n => (newMappings[n] || {}).parent === (this.columnMappings[n] || {}).parent).length !== cols.length) {
                // this.columnMappings = newMappings;
                // this.teller.load(data);
            // } else {
                // this.teller.update(data);
            // }

            const savedStory = this.settings.story.savedStory;
            const timelineState = savedStory ? JSON.parse(savedStory) : {};
            timelineState.timeline_json_data = data;

            if (isFirstUpdate && this.settings.story.autoLoad) {
                // Give it time to load the data first
                setTimeout(() => this.teller.load(timelineState, true), 1000);
            } else {
                this.teller.load(timelineState, false, true);
            }
        }

        const elesToHide = document.querySelectorAll('.introjs-hints, .timelinestoryteller-powerbi');
        for (let i = 0; i < elesToHide.length; i++) {
            elesToHide[i]['style'].display = display;
        }
    }

    /**
     * Saves the current story to powerbi
     */
    private saveStory() {
        log('Saving story to PowerBI');
        const savedStory = JSON.stringify(this.teller.saveState());
        this.host.persistProperties({
            replace: [{
                objectName: 'story',
                selector: null,
                properties: {
                    savedStory
                }
            }]
        });
    }
}
