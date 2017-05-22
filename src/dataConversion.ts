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

        // We need all the columns for now
        if (Object.keys(newMappings).length === cols.length) {

            // We need both dates for it to work properly
            if (!newMappings.start_date || !newMappings.end_date) {
                delete newMappings.start_date;
                delete newMappings.end_date;
            }

            return dataView.table.rows.map(n => {
                const item = {};
                cols.forEach(c => {
                    item[c] = n[(newMappings[c] || {}).index];
                    if (item[c] && (c === 'start_date' || c === 'end_date')) {
                        item[c] = new Date(item[c]);
                    }
                });
                return item;
            });
        }
    }
}