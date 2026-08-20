"use client";
import {useEffect,useState} from "react";
import {type OrderDeliveryPolicy} from "@/services/delivery/orderDeliveryPolicyClientService";
import {marketplacePricingClientService} from "@/services/pricing/marketplacePricingClientService";
export function useOrderDeliveryPolicy(storeId?: string){const [result,setResult]=useState<{key:string;policy:OrderDeliveryPolicy}|null>(null);const key=storeId??"default";useEffect(()=>{let active=true;void marketplacePricingClientService.getOrderDeliveryPolicy(storeId).then((policy)=>{if(active)setResult({key,policy});}).catch(()=>{});return()=>{active=false;};},[key,storeId]);return result?.key===key?result.policy:null;}
