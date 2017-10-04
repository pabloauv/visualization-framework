import BaseModel from './base.model';
import DB from '../middleware/connection.js';
import moment from 'moment';
import async from 'async';

class TestingModel extends BaseModel {

    getStatusCode(status) {
      let statuses = {
        'PENDING': 'pending',
        'COMPLETED': 'completed',
        'QUEUE': 'queue',
        'EXECUTING': 'executing',
        'PROCESSED': 'processed'
      }
      return statuses[status];
    }

    getReports(callback) {
      DB.select('*')
        .order_by('id', 'desc')
        .get('t_reports', callback);
    }

    initiate(callback) {
      DB.insert('t_reports', {}, callback);
    }

    getDashboards(callback) {
      DB.select(['d.id as dashboard_id', 'd.name as dashboard_name', 'concat(d.url, IF(ds.datafile IS NOT NULL, concat("?dataset=", ds.datafile), "")) as url', 'ds.id as dataset_id'])
          .from('t_dashboards as d')
          .join('t_dashboard_datasets as ds', 'ds.dashboard_id = d.id and ds.is_active = 1', 'left')
          .where('d.is_active', '1')
          .get(callback);
        //.get_compiled_select();
    }

    updateStatus(data, where, callback) {
      DB.update('t_reports', data, where, callback);
    }

    insertReportDashboard(data, callback) {
      DB.insert('t_report_dashboards', data, callback);
    }

    insertReportDetails(data, callback) {
      DB.insert_batch('t_report_dashboard_widgets', data, callback);
    }

    updateDataSet(req, res) {
        let {
            report_detail_ids,
            report_id
        } = req.body;

        let status = "pass";
        async.series([
          function(callback) {
             DB.where('rdw.dashboard_id', dashboard_id)
          },
          function(callback) {

          }
        ], function(err, res) {
          this.successResponse('success', {});
        });


        /*let query = DB.where('rdw.dashboard_id', dashboard_id)

        if (report_detail_ids.length) {
            query = query.where_in('rdw.id', report_detail_ids);
            status = "fail";
        }

        query.from('t_report_dashboard_widgets rdw')
            .set('status', status)
            .update(null, null, null, (err, data) => {

                if (err) return console.error(err);

                if (report_detail_ids.length) {
                    DB.where_not_in('rd.id', report_detail_ids)
                        .from('report_detail rd')
                        .set('status', 'pass')
                        .update(null, null, null, (err, data) => {
                            if (err) return console.error(err);

                        });
                }
                if (this.updateReportsPassFailCount(report_id)) {
                    this.successResponse('success', res);
                }

            });*/

    }

    updateReportsPassFailCount(report_id) {

        const select = ['COUNT(*) total, COUNT(status="pass" or null) pass_count', 'COUNT(status="fail" or null) fail_count'];
        DB.select(select).from('report_detail rd')
            .where('rd.report_id', report_id)
            .get((err, response) => {
                let reportData;
                for (let resp in response) {
                    reportData = {
                        total: response[resp].total,
                        pass: parseInt(response[resp].pass_count),
                        fail: response[resp].fail_count,
                        status: 'completed'
                    };
                }

                DB.where('rs.id', report_id)
                    .from('reports rs')
                    .set(reportData)
                    .update(null, null, null, (err, data) => {
                        if (err) return false;

                        return true;
                    });
            });
        return true;
    }

    deleteReports(req, res) {
        const report_id = req.params.report_id;
        DB.delete('reports', {
            id: report_id
        }, (err, data) => {
            if (err) return console.error(err);
            DB.delete('report_detail', {
                report_id: report_id
            }, (err, data) => {
                if (err) return console.error(err);
                this.successResponse('success', res);
            });
        });
    }


    getDetailReport(reportID, callback) {
        const select = [
          'r.created_at', 'r.started_at', 'r.completed_at', 'r.id report_id', 'r.total', 'r.pass', 'r.fail', 'r.message', 'r.status',
          'rdw.id chart_id', 'rdw.chart_name', 'rdw.status chart_status',
          'rd.errors as dataset_errors',
          'dd.id dataset_id, dd.datafile dataset_file', 'dd.name dataset_name', 'dd.description dataset_description',
          'd.id dashboard_id', 'd.name dashboard_name', 'd.url dashboard_url'];

        DB.select(select).from('t_reports r')
            .join('t_report_dashboards rd', `r.id = rd.report_id and r.id = ${reportID}`)
            .join('t_dashboards d', 'rd.dashboard_id = d.id')
            .join('t_report_dashboard_widgets rdw', 'rdw.report_dashboard_id = rd.id', 'left')
            .join('t_dashboard_datasets dd', 'dd.id = rd.dataset_id', 'left')
            .order_by('rd.id')
            .get((err, response) => {
              if(err)
                console.log(err);

                let results = {
                  dashboards: {}
                };

                if(response && response.length) {
                  results = Object.assign({}, results, {
                    created_at: response[0].created_at ? moment(response[0].created_at).format('MM-DD-YYYY HH:mm:ss') : '',
                    started_at: response[0].started_at ? moment(response[0].started_at).format('MM-DD-YYYY HH:mm:ss'): '',
                    completed_at: response[0].completed_at ? moment(response[0].completed_at).format('MM-DD-YYYY HH:mm:ss') : '',
                    total: response[0].total,
                    pass: response[0].pass,
                    fail: response[0].fail,
                    status: response[0].status
                  });

                  for (let widget of response) {
                      if (typeof results.dashboards[widget.dashboard_id] == 'undefined') {
                          results.dashboards[widget.dashboard_id] = {
                              'dashboard_id': widget.dashboard_id,
                              'dashboard_name': widget.dashboard_name,
                              'datasets': {}
                          }
                      }

                      let dataset_id = widget.dataset_id ? widget.dataset_id : 0;
                      if (typeof results.dashboards[widget.dashboard_id]['datasets'][dataset_id] == 'undefined') {
                          results.dashboards[widget.dashboard_id]['datasets'][dataset_id] = {
                              'dataset_id': dataset_id,
                              'dataset_name': widget.dataset_name,
                              'dataset_description': widget.dataset_description,
                              'errors': widget.dataset_errors,
                              'charts': []
                          }
                      }

                      if(widget.chart_id) {
                        results.dashboards[widget.dashboard_id]['datasets'][dataset_id]['charts'].push(widget);
                      }
                  }
                }

                callback(null, results);
            });
    }

    successResponse(response, res) {
        return res.json({
            status: 200,
            error: false,
            results: response,
        });
    }

    errorResponse(err, res) {
        return res.json({
            status: 404,
            error: true,
            results: 'Data Not Found',
        });
    }

}

export default new TestingModel();