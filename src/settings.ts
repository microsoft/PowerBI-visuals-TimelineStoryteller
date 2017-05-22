import dataview from '../lib/powerbi-visuals-utils-dataviewutils';

/**
 * Represents the settings for timeline story teller
 */
export default class TimelineStorytellerSettings extends dataview.DataViewObjectsParser {

    /**
     * Represents the story related settings
     */
    public story: StorySettings = new StorySettings();

    /**
     * The settings used for display
     */
    public display: DisplaySettings = new DisplaySettings();
}

/**
 * Represents the story related settings
 */
class StorySettings {

    /**
     * The saved story
     */
    public savedStory: string = ''; // Needs to be an empty string, otherwise PBI will not pick it up

    /**
     * Boolean indicating whether or not to auto load the story that was saved
     */
    public autoLoad: boolean = false;
}

/**
 * Represents the display settings
 */
class DisplaySettings {
    /**
     * The scale of the UI
     */
    public uiScale: number = 0.7;
}
