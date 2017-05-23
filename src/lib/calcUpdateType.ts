/*
 * MIT License
 * Copyright (c) 2016 Microsoft
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the 'Software"), to deal
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

import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import UpdateType from './UpdateType';
const assignIn = require('lodash/assignIn'); // tslint:disable-line
const ldIsEqual = require('lodash/isEqual');
const ldPick = require('lodash/pick');
const ldSome = require('lodash/some');
declare var _: any;

export const DEFAULT_CALCULATE_SETTINGS: ICalcUpdateTypeOptions = {
    checkHighlights: false,
    defaultUnkownToData: false,
    ignoreCategoryOrder: true,
};

Object.freeze(DEFAULT_CALCULATE_SETTINGS);

/**
 * Calculates the type of update that has occurred between two visual update options, this gives greater granularity than what
 * powerbi has.
 * @param oldOpts The old options
 * @param newOpts The new options
 * @param addlOptions The additional options to use when calculating the update type.
 */
export default function calcUpdateType(
    oldOpts: VisualUpdateOptions,
    newOpts: VisualUpdateOptions,
    addlOptions?: ICalcUpdateTypeOptions|boolean) {
    'use strict';
    let updateType = UpdateType.Unknown;
    const options = assignIn({},
        DEFAULT_CALCULATE_SETTINGS,
        typeof addlOptions === 'boolean' ?
            { defaultUnkownToData: addlOptions } : (addlOptions || {} ));

    if (hasResized(oldOpts, newOpts, options)) {
        updateType ^= UpdateType.Resize;
    }

    if (hasDataChanged2(oldOpts, newOpts, options)) {
        updateType ^= UpdateType.Data;
    }

    if (hasSettingsChanged(oldOpts, newOpts, options)) {
        updateType ^= UpdateType.Settings;
    }

    if (!oldOpts) {
        updateType ^= UpdateType.Initial;
    }

    if (options.defaultUnkownToData && updateType === UpdateType.Unknown) {
        updateType = UpdateType.Data;
    }

    return updateType;
}

function hasDataChanged2(oldOptions: VisualUpdateOptions, newOptions: VisualUpdateOptions, options: ICalcUpdateTypeOptions) {
    'use strict';
    const oldDvs = (oldOptions && oldOptions.dataViews) || [];
    const dvs = newOptions.dataViews || [];
    if (oldDvs.length !== dvs.length) {
        dvs.forEach(dv => markDataViewState(dv));
        return true;
    }
    for (let i = 0; i < oldDvs.length; i++) {
        if (hasDataViewChanged(oldDvs[i], dvs[i], options)) {
            dvs.forEach(dv => markDataViewState(dv));
            return true;
        }
    }
    dvs.forEach(dv => markDataViewState(dv));
    return false;
}


function hasSettingsChanged(oldOptions: VisualUpdateOptions, newOptions: VisualUpdateOptions, options: ICalcUpdateTypeOptions) {
    'use strict';
    const oldDvs = (oldOptions && oldOptions.dataViews) || [];
    const dvs = newOptions.dataViews || [];

    // Is this correct?
    if (oldDvs.length !== dvs.length) {
        return true;
    }

    for (let i = 0; i < oldDvs.length; i++) {
        const oM: any = oldDvs[i].metadata || {};
        const nM: any = dvs[i].metadata || {};
        if (!ldIsEqual(oM.objects, nM.objects)) {
            return true;
        }
    }
}

function hasResized(oldOptions: VisualUpdateOptions, newOptions: VisualUpdateOptions, options: ICalcUpdateTypeOptions) {
    'use strict';
    return !oldOptions || newOptions['resizeMode'];
}

function markDataViewState(dv: powerbi.DataView) {
    'use strict';
    if (dv) {
        let cats2 = (dv.categorical && dv.categorical.categories) || [];
        // set the length, so next go around, hasCategoryChanged can properly compare
        cats2.forEach(dc => {
            if (dc.identity) {
                dc.identity['$prevLength'] = dc.identity.length;
            }
        });
    }
}

const colProps = ['queryName', 'roles', 'sort', 'aggregates'];


function hasArrayChanged<T>(a1: T[], a2: T[], isEqual: (a: T, b: T) => boolean) {
    'use strict';
    // If the same array, shortcut (also works for undefined/null)
    if (a1 === a2) {
        return false;

    // If one of them is null and the other one isn't
    } else if (!a1 || !a2) {
        return true;
    }

    if (a1.length !== a2.length) {
        return true;
    }

    if (a1.length > 0) {
        const last = a1.length - 1;

        // check first and last, initially, as it should find 99.95% of changed cases
        return (!isEqual(a1[0], a2[0])) ||
            (!isEqual(a1[last], a2[last])) ||

            // Check everything
            (ldSome(a1, ((n: any, i: number) => !isEqual(n, a2[i]))));
    }
    return false;
}

function hasCategoryChanged(dc1: powerbi.DataViewCategoryColumn, dc2: powerbi.DataViewCategoryColumn) {
    'use strict';
    let changed = hasArrayChanged<powerbi.DataViewScopeIdentity>(dc1.identity, dc2.identity, (a, b) => a.key === b.key);
    // Samesees array, they reuse the array for appending items
    if (dc1.identity && dc2.identity && dc1.identity === dc2.identity) {
        // TODO: This will not catch the case they reuse the array, ie clear the array, add new items with the same amount as the old one.
        let prevLength = dc1.identity['$prevLength'];
        let newLength = dc1.identity.length;
        dc1.identity['$prevLength'] = newLength;
        return prevLength !== newLength;
    }
    return changed;
}

function hasDataViewChanged(dv1: powerbi.DataView, dv2: powerbi.DataView, options: ICalcUpdateTypeOptions) {
    'use strict';
    let cats1 = (dv1.categorical && dv1.categorical.categories) || [];
    let cats2 = (dv2.categorical && dv2.categorical.categories) || [];
    let vals1 = (dv1.categorical && dv1.categorical.values) || <powerbi.DataViewValueColumns>[];
    let vals2 = (dv2.categorical && dv2.categorical.values) || <powerbi.DataViewValueColumns>[];
    let cols1 = (dv1.metadata && dv1.metadata.columns) || [];
    let cols2 = (dv2.metadata && dv2.metadata.columns) || [];
    if (cats1.length !== cats2.length ||
        cols1.length !== cols2.length ||
        vals1.length !== vals2.length) {
        return true;
    }

    if (options.ignoreCategoryOrder) {
        cols1 = cols1.sort((a, b) => a.queryName.localeCompare(b.queryName));
        cols2 = cols2.sort((a, b) => a.queryName.localeCompare(b.queryName));
    }

    for (let i = 0; i < cols1.length; i++) {
        // The underlying column has changed, or if the roles have changed
        if (!ldIsEqual(ldPick(cols1[i], colProps), ldPick(cols2[i], colProps))) {
            return true;
        }
    }

    for (let i = 0; i < cats1.length; i++) {
        if (hasCategoryChanged(cats1[i], cats2[i])) {
            return true;
        }
    }

    if (options.checkHighlights) {
        for (let i = 0; i < vals1.length; i++) {
            if (hasHighlightsChanged(vals1[i], vals2[i])) {
                return true;
            }
        }
    }
    return false;
}

function hasHighlightsChanged(val1: powerbi.DataViewValueColumn, val2: powerbi.DataViewValueColumn) {
    'use strict';
    if (val1 && val2) {
        const h1 = val1.highlights || [];
        const h2 = val2.highlights || [];
        if (h1 === h2) {
            // TODO: This will not catch the case they reuse the array,
            // ie clear the array, add new items with the same amount as the old one.
            let prevLength = h1['$prevLength'];
            let newLength = h1.length;
            h1['$prevLength'] = newLength;
            return prevLength !== newLength;
        }
        if (h1.length !== h2.length) {
            return true;
        }

        // Check any highlights have changed.
        return h1.some((h, i) => h !== h2[i]);
    }
    return false;
}

export interface ICalcUpdateTypeOptions {
    checkHighlights?: boolean;
    ignoreCategoryOrder?: boolean;
    defaultUnkownToData?: boolean;
}