# Revenue analysis

The former revenue forecast page is removed. Its URL redirects to revenue analysis; existing role policy data and saved business records are preserved.

Analysis conditions have four steps: target, production, included costs, and packaging. Numerical display uses grouping and at most two decimal places without rounding calculation inputs. Packed CBM permits six displayed decimals because smaller garment volumes need that precision.

ST/PT remain based on the saved process version. AT is read from the current shared prediction using its existing quantity curve, and is available only when every applicable process has a prediction. Missing AT is never replaced by ST/PT or manually invented.

Payroll categories, approved linked purchases, rent, office costs, other factory costs and direct costs can be selected independently. Monthly operating costs use the estimated production period. Standalone historical purchase estimates are recomputed from included source costs and their distinct order quantities.

Company category packing volumes are stored as revisioned `CATEGORY_PACKAGING:<orgId>` settings. Active company administrators edit them in app settings. Existing style-specific packed volume takes precedence; a scenario override changes only the estimate. Reads never create settings or modify styles.

Box capacity is the rounded-up box-CBM / packed-piece-CBM ratio, as requested; a garment larger than a box has capacity zero. Boxes are rounded up from order quantity / capacity. Missing volume is shown explicitly, with a link to app settings; the former arbitrary 50-piece fallback and waste margin are not used by revenue analysis. Polybags and boxes each distinguish company purchase from customer supply. Customer-supplied quantities remain visible but contribute zero purchase cost. Source costs should be selected to avoid double-counting packaging already included in a linked expense.

Validation: focused order-profit/profit-scenario/revenue-analysis/revenue-style-analysis tests, category packaging settings and revenue flow browser tests in Korean/English/Vietnamese, access-policy regression, both builds and encoding check. No schema migration or operational financial data updates.
