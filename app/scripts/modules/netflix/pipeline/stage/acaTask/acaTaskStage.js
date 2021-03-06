'use strict';

import {ACCOUNT_SERVICE} from 'core/account/account.service';
import {CLOUD_PROVIDER_REGISTRY} from 'core/cloudProvider/cloudProvider.registry';
import {NetflixSettings} from '../../../netflix.settings';

let angular = require('angular');

module.exports = angular.module('spinnaker.netflix.pipeline.stage.acaTaskStage', [
  CLOUD_PROVIDER_REGISTRY,
  require('../canary/canaryExecutionSummary.controller'),
  ACCOUNT_SERVICE,
])
  .config(function (pipelineConfigProvider) {
    if (NetflixSettings.feature.netflixMode) {
      pipelineConfigProvider.registerStage({
        label: 'ACA Task',
        description: 'Runs a canary task against an existing cluster, asg, or query',
        key: 'acaTask',
        restartable: true,
        templateUrl: require('./acaTaskStage.html'),
        executionDetailsUrl: require('./acaTaskExecutionDetails.html'),
        executionSummaryUrl: require('./acaTaskExecutionSummary.html'),
        stageFilter: (stage) => ['monitorAcaTask', 'acaTask'].includes(stage.type),
        executionLabelTemplateUrl: require('../canary/canaryExecutionLabel.html'),
        controller: 'AcaTaskStageCtrl',
        controllerAs: 'acaTaskStageCtrl',
        validators: [
        ],
      });
    }
  })
  .controller('AcaTaskStageCtrl', function ($scope, $uibModal, stage,
                                           namingService, providerSelectionService,
                                           authenticationService, cloudProviderRegistry,
                                           awsServerGroupTransformer, accountService) {

    var user = authenticationService.getAuthenticatedUser();
    $scope.stage = stage;
    $scope.stage.baseline = $scope.stage.baseline || {};
    $scope.stage.canary = $scope.stage.canary || {};
    $scope.stage.canary.application = $scope.stage.canary.application || $scope.application.name;
    $scope.stage.canary.owner = $scope.stage.canary.owner || (user.authenticated ? user.name : null);
    $scope.stage.canary.watchers = $scope.stage.canary.watchers || [];
    $scope.stage.canary.canaryConfig = $scope.stage.canary.canaryConfig || { name: [$scope.pipeline.name, 'Canary'].join(' - ') };
    $scope.stage.canary.canaryConfig.canaryHealthCheckHandler = Object.assign($scope.stage.canary.canaryConfig.canaryHealthCheckHandler || {}, {'@class':'com.netflix.spinnaker.mine.CanaryResultHealthCheckHandler'});
    $scope.stage.canary.canaryConfig.canaryAnalysisConfig = $scope.stage.canary.canaryConfig.canaryAnalysisConfig || {};
    $scope.stage.canary.canaryConfig.canaryAnalysisConfig.notificationHours = $scope.stage.canary.canaryConfig.canaryAnalysisConfig.notificationHours || [];
    $scope.stage.canary.canaryConfig.canaryAnalysisConfig.useLookback = $scope.stage.canary.canaryConfig.canaryAnalysisConfig.useLookback || false;
    $scope.stage.canary.canaryConfig.canaryAnalysisConfig.lookbackMins = $scope.stage.canary.canaryConfig.canaryAnalysisConfig.lookbackMins || 0;
    $scope.stage.canary.canaryConfig.canaryAnalysisConfig.useGlobalDataset = $scope.stage.canary.canaryConfig.canaryAnalysisConfig.useGlobalDataset || false;

    $scope.stage.canary.canaryDeployments = $scope.stage.canary.canaryDeployments || [{type: 'query', '@class':'.CanaryTaskDeployment'}];

    $scope.canaryDeployment = $scope.stage.canary.canaryDeployments[0];

    //TODO: Extract to be reusable with canaryStage [zkt]
    this.recipients = $scope.stage.canary.watchers
      ? angular.isArray($scope.stage.canary.watchers) //if array, convert to comma separated string
        ? $scope.stage.canary.watchers.join(', ')
        : $scope.stage.canary.watchers //if it is not an array it is probably a SpEL
      : '';

    accountService.getUniqueAttributeForAllAccounts('aws', 'regions')
      .then( (regions) => {
        $scope.regions = regions.sort();
      });


    accountService.listAccounts('aws').then(function(accounts) {
      $scope.accounts = accounts;
    });


    //TODO: Extract to be reusable with canaryStage [zkt]
    this.updateWatchersList = () => {
      if (this.recipients.includes('${')) { //check if SpEL; we don't want to convert to array
        $scope.stage.canary.watchers = this.recipients;
      } else {
        $scope.stage.canary.watchers = [];
        this.recipients.split(',').forEach((email) => {
          $scope.stage.canary.watchers.push(email.trim());
        });
      }
    };

    this.notificationHours = $scope.stage.canary.canaryConfig.canaryAnalysisConfig.notificationHours.join(',');

    this.splitNotificationHours = () => {
      var hoursField = this.notificationHours || '';
      $scope.stage.canary.canaryConfig.canaryAnalysisConfig.notificationHours = _.map(hoursField.split(','), function(str) {
        if (!parseInt(str.trim()).isNaN) {
          return parseInt(str.trim());
        }
        return 0;
      });
    };

  });
