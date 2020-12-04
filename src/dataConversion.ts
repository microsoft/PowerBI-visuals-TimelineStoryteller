import powerbi from "powerbi-visuals-api";

/**
 * Converts the powerbi dataview to the data format required by TimelineStoryteller
 * @param {powerbi.DataView} dataView The dataview to convert
 * @returns {object} The data compatible with TimelineStoryteller
 */
export default function (dataView: powerbi.DataView) {
    const cols = [
        'facet',
        'content_text',
        'start_date',
        'end_date',
        'category'
    ];

    if (dataView && dataView.table && dataView.table.columns) {
        const newMappings: any = {};
        dataView.table.columns.forEach((column, index) => {
            Object.keys(column.roles).sort().forEach(role => {
                newMappings[role] = {
                    index,
                    parent: column.queryName + ':' + column.groupName
                };
            });
        });

        // We need both dates for it to work properly
        return dataView.table.rows.map(n => {
            const item = {};
            cols.forEach(c => {
                let value = n[(newMappings[c] || {}).index];
                if (value && (c === 'start_date' || c === 'end_date')) {
                    if (!(value instanceof Date)) {
                        // TimelineStoryteller likes strings
                        value = value + "";
                    }
                }
                item[c] = value;
            });
            return item;
        });
    }
}