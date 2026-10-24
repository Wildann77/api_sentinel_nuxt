import type { ReportExportQueryDto } from "@sentinel/contracts";

export interface StreamCsvReportCommand {
  readonly query: ReportExportQueryDto;
}

export interface StreamCsvReportUseCase {
  execute(command: StreamCsvReportCommand): Promise<AsyncIterable<string>>;
}
