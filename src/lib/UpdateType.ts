/*
 * MIT License
 * Copyright (c) 2016 Microsoft
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
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

/**
 * Represents an update type for a visual
 */
enum UpdateType {

    /**
     * This is an unknown update type
     */
    Unknown = 0,

    /**
     * This is a data update
     */
    Data = 1 << 0,

    /**
     * This is a resize operation
     */
    Resize = 1 << 1,

    /**
     * This has some settings that have been changed
     */
    Settings = 1 << 2,

    /**
     * This is the initial update
     */
    Initial = 1 << 3,

    // Some utility keys for debugging
    DataAndResize = UpdateType.Data | UpdateType.Resize,
    DataAndSettings = UpdateType.Data | UpdateType.Settings,
    SettingsAndResize = UpdateType.Settings | UpdateType.Resize,
    All = UpdateType.Data | UpdateType.Resize | UpdateType.Settings
}
export default UpdateType;