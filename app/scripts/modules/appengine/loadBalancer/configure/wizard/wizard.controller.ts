import {module} from 'angular';
import {IStateService} from 'angular-ui-router';
import {IModalServiceInstance} from 'angular-ui-bootstrap';
import {cloneDeep} from 'lodash';

import {Application} from 'core/application/application.model';
import {
  AppengineLoadBalancerTransformer,
  AppengineLoadBalancerUpsertDescription, IAppengineTrafficSplitDescription
} from 'appengine/loadBalancer/transformer';
import {LOAD_BALANCER_WRITE_SERVICE, LoadBalancerWriter} from 'core/loadBalancer/loadBalancer.write.service';
import {TASK_MONITOR_BUILDER, TaskMonitor, TaskMonitorBuilder} from 'core/task/monitor/taskMonitor.builder';

import './wizard.less';

class AppengineLoadBalancerWizardController {
  public state = {loading: true};
  public loadBalancer: AppengineLoadBalancerUpsertDescription;
  public heading: string;
  public submitButtonLabel: string;
  public taskMonitor: TaskMonitor;

  static get $inject() { return ['$scope', '$state', '$uibModalInstance', 'application', 'loadBalancer', 'isNew',
                                 'forPipelineConfig', 'appengineLoadBalancerTransformer', 'taskMonitorBuilder',
                                 'loadBalancerWriter', 'wizardSubFormValidation']; }

  constructor(public $scope: ng.IScope,
              private $state: IStateService,
              private $uibModalInstance: IModalServiceInstance,
              private application: Application,
              loadBalancer: AppengineLoadBalancerUpsertDescription,
              public isNew: boolean,
              private forPipelineConfig: boolean,
              private transformer: AppengineLoadBalancerTransformer,
              private taskMonitorBuilder: TaskMonitorBuilder,
              private loadBalancerWriter: LoadBalancerWriter,
              private wizardSubFormValidation: any) {
    this.submitButtonLabel = this.forPipelineConfig ? 'Done' : 'Update';

    if (this.isNew) {
      this.heading = 'Create New Load Balancer';
    } else {
      this.heading = `Edit ${[loadBalancer.name, loadBalancer.region, loadBalancer.account || loadBalancer.credentials].join(':')}`;
      this.transformer.convertLoadBalancerForEditing(loadBalancer, application)
        .then((convertedLoadBalancer) => {
          this.loadBalancer = this.transformer.convertLoadBalancerToUpsertDescription(convertedLoadBalancer);
          if (loadBalancer.split && !this.loadBalancer.splitDescription) {
            this.loadBalancer.splitDescription = AppengineLoadBalancerUpsertDescription
              .convertTrafficSplitToTrafficSplitDescription(loadBalancer.split);
          } else {
            this.loadBalancer.splitDescription = loadBalancer.splitDescription;
          }
          this.loadBalancer.mapAllocationsToPercentages();
          this.setTaskMonitor();
          this.initializeFormValidation();
          this.state.loading = false;
        });
    }
  }

  public submit(): any {
    let description = cloneDeep(this.loadBalancer);
    description.mapAllocationsToDecimals();
    delete description.serverGroups;

    if (this.forPipelineConfig) {
      return this.$uibModalInstance.close(description);
    } else {
      return this.taskMonitor.submit(() => {
        return this.loadBalancerWriter.upsertLoadBalancer(description, this.application, 'Update');
      });
    }
  }

  public cancel(): void {
    this.$uibModalInstance.dismiss();
  }

  public showSubmitButton(): boolean {
    return this.wizardSubFormValidation.subFormsAreValid();
  }

  private setTaskMonitor(): void {
    this.taskMonitor = this.taskMonitorBuilder.buildTaskMonitor({
      application: this.application,
      title: 'Updating your load balancer',
      modalInstance: this.$uibModalInstance,
      onTaskComplete: () => this.onTaskComplete(),
    });
  }

  private initializeFormValidation(): void {
    this.wizardSubFormValidation.config({form: 'form', scope: this.$scope})
      .register({
        page: 'basic-settings',
        subForm: 'basicSettingsForm',
        validators: [
          {
            watchString: 'ctrl.loadBalancer.splitDescription',
            validator: (splitDescription: IAppengineTrafficSplitDescription): boolean => {
              return splitDescription.allocationDescriptions.reduce((sum, description) => sum + description.allocation, 0) === 100;
            },
            watchDeep: true,
          }
        ]
      })
      .register({page: 'advanced-settings', subForm: 'advancedSettingsForm'});
  }

  private onTaskComplete(): void {
    this.application.getDataSource('loadBalancers').refresh();
    this.application.getDataSource('loadBalancers').onNextRefresh(this.$scope, () => this.onApplicationRefresh());
  }

  private onApplicationRefresh(): void {
    // If the user has already closed the modal, do not navigate to the new details view
    if ((this.$scope as any).$$destroyed) { // $$destroyed is not in the ng.IScope interface
      return;
    }

    this.$uibModalInstance.dismiss();
    let newStateParams = {
      name: this.loadBalancer.name,
      accountId: this.loadBalancer.credentials,
      region: this.loadBalancer.region,
      provider: 'appengine',
    };

    if (!this.$state.includes('**.loadBalancerDetails')) {
      this.$state.go('.loadBalancerDetails', newStateParams);
    } else {
      this.$state.go('^.loadBalancerDetails', newStateParams);
    }
  }
}

export const APPENGINE_LOAD_BALANCER_WIZARD_CTRL = 'spinnaker.appengine.loadBalancer.wizard.controller';

module(APPENGINE_LOAD_BALANCER_WIZARD_CTRL, [
  TASK_MONITOR_BUILDER,
  LOAD_BALANCER_WRITE_SERVICE,
  require('core/modal/wizard/wizardSubFormValidation.service.js'),
]).controller('appengineLoadBalancerWizardCtrl', AppengineLoadBalancerWizardController);

