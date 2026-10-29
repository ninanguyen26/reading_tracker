/** First page = 0%, last page = 100%. */
export const pageToPercent = (page: number, total: number) => (total <= 1 ? 1 : (page - 1) / (total - 1))
