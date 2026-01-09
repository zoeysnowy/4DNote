export interface HolidayInfo {
  /** 节日名称 */
  name: string;
  /** 是否为法定节假日 */
  isHoliday: boolean;
  /** 假期天数（仅法定节假日） */
  days?: number;
  /** 节日 Emoji */
  emoji?: string;
  /** 节日描述 */
  description?: string;
  /** 假期中的第几天（1-based） */
  dayIndex?: number;
}