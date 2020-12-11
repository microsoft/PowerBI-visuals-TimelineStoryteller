import powerbiVisualsApi from "powerbi-visuals-api";
import IVisualHost = powerbiVisualsApi.extensibility.visual.IVisualHost;
import ISelectionId = powerbiVisualsApi.extensibility.ISelectionId;

/**
 * Converts the powerbi dataview to the data format required by TimelineStoryteller
 * @param {powerbiVisualsApi.DataView} dataView The dataview to convert
 * @returns {object} The data compatible with TimelineStoryteller
 */
export default function (dataView: powerbiVisualsApi.DataView, host: IVisualHost) {
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
        return dataView.table.rows.map((row, rowIndex) => {
            const item = {
                selectionId: null
            };
            cols.forEach(column => {
                let value = row[(newMappings[column] || {}).index];
                if (value && (column === 'start_date' || column === 'end_date')) {
                    if (!(value instanceof Date)) {
                        // TimelineStoryteller likes strings
                        value = value + "";
                    }
                }
                item[column] = value;
            });

            const selection: ISelectionId = host.createSelectionIdBuilder()
                .withTable(dataView.table, rowIndex)
                .createSelectionId();

            item.selectionId = selection;

            return item;
        });
    }
}